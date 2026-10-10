"""Local-only regression for hosted libSQL's expression-depth limit.

Requires Python 3.11+ (sqlite3.Connection.setlimit). Never opens a remote DB.
Statement caching is disabled so lowering the limit actually reparses SQL.
"""
import datetime
import json
import pathlib
import re
import sqlite3
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = "20261011000000_balance_identity_guard_expressions"
GUARDS = {"Authorized_execution_event_guard", "ClubMember_retirement_guard"}


def connect(filename=":memory:"):
    db = sqlite3.connect(filename, cached_statements=0, isolation_level=None)
    if not hasattr(db, "setlimit"):
        raise RuntimeError("Expression-depth regression requires Python 3.11+ sqlite3.setlimit")
    return db


def predecessor():
    db = connect()
    migrations = sorted((ROOT / "prisma/migrations").glob("*/migration.sql"))
    old = [p for p in migrations if p.parent.name < MIGRATION]
    assert len(old) == 58, "This regression must exercise the exact applied 58-migration predecessor"
    for migration in old:
        db.executescript(migration.read_text(encoding="utf-8-sig"))
    return db


def upgrade(db):
    db.executescript((ROOT / "prisma/migrations" / MIGRATION / "migration.sql").read_text())


def snapshot(db):
    tables = db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_prisma_migrations' ORDER BY name").fetchall()
    result = []
    for (name,) in tables:
        cursor = db.execute('SELECT * FROM "' + name.replace('"', '""') + '" ORDER BY rowid')
        columns = [column[0] for column in cursor.description]
        result.append({"name": name, "rows": [dict(zip(columns, row)) for row in cursor]})
    return result


def schema(db):
    return {name: (kind, table, sql) for kind, name, table, sql in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")}


def predicate_tokens(sql):
    # Retain every operator, quoted identifier, literal, and keyword. The only
    # permitted token change in these two trigger definitions is parentheses.
    return [token for token in re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\w+|[^\s]", sql) if token not in ("(", ")")]


INSERT = "INSERT INTO ClubAdmissionEvent (id,admissionRequestId,actorUserId,action,revision,detailsJson,createdAt) VALUES ('probe','missing','missing','SUBMIT',0,'{}',0)"
RETIRE = "UPDATE CommunityMember SET retiredByAdmissionEventId=retiredByAdmissionEventId"


class HostedDepthRegression(unittest.TestCase):
    def test_exact_predecessor_fails_and_forward_migration_compiles_at_100(self):
        with predecessor() as db:
            db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
            self.assertEqual(db.getlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH), 100)
            for query in (INSERT, RETIRE):
                with self.assertRaisesRegex(sqlite3.OperationalError, "Expression tree is too large.*100"):
                    db.execute("EXPLAIN " + query)
            upgrade(db)
            for query in (INSERT, RETIRE):
                db.execute("EXPLAIN " + query)

    def test_all_81_application_write_shapes_compile_at_100(self):
        with predecessor() as db:
            upgrade(db)
            db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
            tables = db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
            count = 0
            for (name,) in tables:
                table = '"' + name + '"'
                columns = ['"' + row[1] + '"' for row in db.execute("PRAGMA table_info(" + table + ")")]
                queries = ["INSERT INTO " + table + " (" + ",".join(columns) + ") VALUES (" + ",".join("NULL" for _ in columns) + ")", "UPDATE " + table + " SET " + ",".join(column + "=" + column for column in columns), "DELETE FROM " + table]
                for query in queries:
                    with self.subTest(query=query):
                        db.execute("EXPLAIN " + query)
                    count += 1
            self.assertEqual(count, 81)

    def test_only_two_groupings_change_and_populated_rows_are_preserved(self):
        with predecessor() as db:
            db.execute("INSERT INTO Account(id,email,passwordHash,name,updatedAt) VALUES ('existing','fixture@example.invalid','fixture','Existing',1700000000000)")
            db.execute("INSERT INTO User(id,name,ownerUserId,updatedAt) VALUES ('existing-player','Existing Player','existing',1700000000000)")
            before, before_schema = snapshot(db), schema(db)
            upgrade(db)
            self.assertEqual(snapshot(db), before)
            after_schema = schema(db)
            self.assertEqual(set(before_schema), set(after_schema))
            changed = {name for name in before_schema if before_schema[name] != after_schema[name]}
            self.assertEqual(changed, GUARDS)
            for name in GUARDS:
                self.assertEqual(predicate_tokens(before_schema[name][2]), predicate_tokens(after_schema[name][2]))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_depth_100_retains_ownership_retirement_authority_and_audit_guards(self):
        with predecessor() as db:
            upgrade(db)
            db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
            for account in ("existing", "other"):
                db.execute("INSERT INTO Account(id,email,passwordHash,name,updatedAt) VALUES (?,?,?,?,0)", (account, account + "@example.invalid", "fixture", account))
            db.execute("INSERT INTO User(id,name,ownerUserId,updatedAt) VALUES ('owned','Owned','existing',0)")
            db.execute("INSERT INTO Community(id,name,createdById,updatedAt) VALUES ('club','Club','existing',0)")
            db.execute("INSERT INTO CommunityMember(id,communityId,userId,archivedAt) VALUES ('member','club','owned',0)")
            db.execute("INSERT INTO ClubJoinRequest(id,clubId,userId,updatedAt) VALUES ('request','club','other',0)")
            db.execute("INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision) VALUES ('ordinary','request','other','SUBMIT',0)")
            before = snapshot(db)
            forbidden = [
                ("UPDATE User SET ownerUserId='other' WHERE id='owned'", "PLAYER_OWNER_IMMUTABLE"),
                ("UPDATE CommunityMember SET retiredByAdmissionEventId='ordinary' WHERE id='member'", "PLAYER_RETIREMENT_INVALID"),
                ("INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision,detailsJson) VALUES ('forged','request','other','EXECUTE_AUTHORIZED_ACCESS_RESTORE',1,'{}')", "AUTHORIZED_(EXECUTION_INVALID|ACCESS_RESTORE_IDENTITY_INVALID)"),
                ("INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision) VALUES ('replace','request','other','SUBMIT',0)", "RECOVERY_APPROVAL_INVALID"),
            ]
            for query, error in forbidden:
                with self.subTest(query=query):
                    with self.assertRaisesRegex(sqlite3.IntegrityError, error):
                        db.execute(query)
                    self.assertEqual(snapshot(db), before)


def replay(payload_path):
    """Replay actual Prisma flow statements from an existing isolated fixture."""
    payload = json.loads(pathlib.Path(payload_path).read_text())
    db = connect(payload["database"])
    db.execute("PRAGMA foreign_keys=ON")
    db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
    existing_events = {row[0] for row in db.execute('SELECT id FROM PlayerInvitationEvent')}
    events = next(table["rows"] for table in payload["expected"] if table["name"] == "PlayerInvitationEvent")
    generated_events = iter(row for row in events if row["id"] not in existing_events)
    current_event = {}

    def fixture_randomblob(size):
        # Trigger audit IDs and CURRENT_TIMESTAMP are nondeterministic. Seed
        # their exact verified values rather than omitting audit fields from
        # the complete final snapshot comparison.
        assert size == 16
        event = next(generated_events, {"id": "00" * 16, "createdAt": current_event.get("createdAt", "2026-10-11 00:00:00")})
        current_event.clear()
        current_event.update(event)
        return bytes.fromhex(current_event["id"])

    db.create_function("randomblob", 1, fixture_randomblob)
    db.create_function("current_timestamp", 0, lambda: current_event["createdAt"])
    errors = []
    for item in payload["queries"]:
        # Prisma 5.22 query logs do not JSON-escape a detailsJson parameter.
        # Parse those embedded JSON objects as one string binding, retaining
        # their exact serialization; every other binding uses JSON decoding.
        raw, args, offset = item["params"], [], 1
        decoder = json.JSONDecoder()
        while offset < len(raw) - 1:
            if raw[offset:offset + 2] == '"{':
                _, end = decoder.raw_decode(raw, offset + 1)
                assert raw[end] == '"'
                args.append(raw[offset + 1:end])
                offset = end + 1
            else:
                value, offset = decoder.raw_decode(raw, offset)
                args.append(value)
            if raw[offset] == ',':
                offset += 1
        # Prisma query-event logs format Date bindings as UTC text; its SQLite
        # connector writes those bindings as Unix milliseconds.
        for index, value in enumerate(args):
            if isinstance(value, str) and re.fullmatch(r"\d{4}-\d\d-\d\d[ T].*(?: UTC|Z|\+00:00)", value):
                args[index] = round(datetime.datetime.fromisoformat(value.replace(" UTC", "+00:00").replace("Z", "+00:00")).timestamp() * 1000)
        try:
            db.execute(item["query"], args).fetchall()
        except sqlite3.Error as error:
            if "Expression tree" in str(error):
                raise
            errors.append(str(error))
    assert len(errors) == payload.get("expectedErrors", 0), errors
    for expected in payload.get("errorMessages", []):
        assert any(expected in error for error in errors), (expected, errors)
    actual = snapshot(db)
    if actual != payload["expected"]:
        differences = [(a, b) for a, b in zip(actual, payload["expected"]) if a != b]
        raise AssertionError(differences)
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    db.close()
    print(json.dumps({"depth": 100, "queries": len(payload["queries"]), "errors": errors, "snapshotMatched": True}))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--replay":
        replay(sys.argv[2])
    else:
        unittest.main()

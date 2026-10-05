import { submitAdmissionApi, admissionDiscoveryApi } from "@/lib/clubAdmissionApi";
export const POST = (request: Request) => submitAdmissionApi(request);
export const GET = (request: Request) => admissionDiscoveryApi(request);

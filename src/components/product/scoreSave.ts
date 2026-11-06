/** Apply the accepted score response before starting any follow-up reads. */
export async function saveScoreWithBackgroundRefresh<T>(
  submit: () => Promise<T>,
  apply: (response: T) => void,
  refresh: () => Promise<unknown>,
) {
  const response = await submit();
  apply(response);
  void Promise.resolve().then(refresh).catch(() => {});
  return response;
}

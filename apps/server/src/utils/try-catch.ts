type ResultTuple<T, E = Error> = [T | null, E | null];

export async function tryCatch<T, E = Error>(
  promise: Promise<T>
): Promise<ResultTuple<T, E>> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error as E];
  }
}

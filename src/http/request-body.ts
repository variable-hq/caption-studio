export class RequestBodyTooLargeError extends Error {}

export class InvalidRequestBodyError extends Error {}

async function readBoundedBytes(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedText(request: Request, maximumBytes: number) {
  return new TextDecoder().decode(await readBoundedBytes(request, maximumBytes));
}

export async function readJsonObject(request: Request, maximumBytes: number) {
  const body = await readBoundedText(request, maximumBytes);
  if (!body) return {};

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidRequestBodyError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof InvalidRequestBodyError) throw error;
    throw new InvalidRequestBodyError();
  }
}

export async function readFormData(request: Request, maximumBytes: number) {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
    throw new InvalidRequestBodyError();
  }

  const body = await readBoundedBytes(request, maximumBytes);
  try {
    return await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new InvalidRequestBodyError();
  }
}

// Utility functions for tests
export function createMockRequest(data: Record<string, unknown>): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

export function createMockFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}

export function mockEnv(env: Record<string, string>) {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  return () => {
    process.env = originalEnv;
  };
}

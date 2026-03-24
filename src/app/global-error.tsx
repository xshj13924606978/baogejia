'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorMessage = error instanceof Error ? error.message : '发生了未知错误';

  return (
    <html lang="zh-CN">
      <body>
        <h2>出现了一些问题</h2>
        <p>{errorMessage}</p>
        <button onClick={reset}>重试</button>
      </body>
    </html>
  );
}

'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <h2>出现了一些问题</h2>
        <p>{error.message}</p>
        <button onClick={reset}>重试</button>
      </body>
    </html>
  );
}

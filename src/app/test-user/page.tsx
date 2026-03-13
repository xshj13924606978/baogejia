'use client';

import React from 'react';
import { useUser } from '@/contexts/UserContext';

function TestUserPage() {
  try {
    const { user, loading } = useUser();

    return (
      <div style={{ padding: '20px' }}>
        <h1>UserContext 测试</h1>
        <p>loading: {loading ? 'true' : 'false'}</p>
        <p>user: {user ? JSON.stringify(user) : 'null'}</p>
      </div>
    );
  } catch (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>UserContext 错误</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
}

export default TestUserPage;

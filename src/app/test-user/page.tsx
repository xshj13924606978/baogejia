'use client';

import React from 'react';
import { useUser } from '@/contexts/UserContext';

function TestUserPage() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>UserContext 测试</h1>
        <p>loading: true</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>UserContext 测试</h1>
      <p>loading: false</p>
      <p>user: {user ? JSON.stringify(user) : 'null'}</p>
    </div>
  );
}

export default TestUserPage;

// Browser tests only. The production Vite configuration never aliases this module.
import type { ReactNode } from 'react';
const accessToken = async () => 'browser-test-token';
const login = () => { window.location.search = '?signed-in=1'; };
const logout = async () => { window.location.search = ''; };
export const PrivyProvider = ({ children }: { children: ReactNode }) => children;
export const usePrivy = () => ({ ready: true, user: { id: 'did:privy:test' }, authenticated: new URLSearchParams(window.location.search).has('signed-in'), login, logout, getAccessToken: accessToken });

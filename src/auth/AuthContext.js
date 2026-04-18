// Context object only. Provider lives in AuthProvider.jsx.
// Split for react-refresh / fast-refresh compatibility.

import { createContext } from 'react';

export const AuthContext = createContext(null);

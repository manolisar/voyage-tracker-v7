// Context object only. Provider lives in SessionProvider.jsx.
// Split for react-refresh / fast-refresh compatibility.

import { createContext } from 'react';

export const SessionContext = createContext(null);

import { Request, Response, NextFunction } from 'express';
import basicAuth from 'basic-auth';
import bcrypt from 'bcrypt';
import { pool } from '../config/database';

export interface AuthenticatedRequest extends Request {
  user?: { id: number; username: string };
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const credentials = basicAuth(req);

  if (!credentials) {
    res.set('WWW-Authenticate', 'Basic realm="CalDAV/CardDAV Server"');
    return res.status(401).send('Authentication required');
  }

  try {
      const result = await pool.query(
        'SELECT id, username, password_hash FROM caldav_users WHERE username = $1',
        [credentials.name]
      );    if (result.rows.length === 0) {
      return res.status(401).send('Invalid credentials');
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(credentials.pass, user.password_hash);

    if (!validPassword) {
      return res.status(401).send('Invalid credentials');
    }

    req.user = { id: user.id, username: user.username };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).send('Internal server error');
  }
}

export function webdavMethods(req: Request, res: Response, next: NextFunction) {
  // Enable WebDAV methods
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT'];
  
  res.set('Allow', allowedMethods.join(', '));
  res.set('DAV', '1, 2, 3, calendar-access, addressbook');
  
  next();
}
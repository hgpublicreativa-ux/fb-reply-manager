import { Request, Response, NextFunction } from 'express';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  req.user = { userId: process.env.OWNER_USER_ID!, email: '' };
  next();
}

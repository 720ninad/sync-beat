export interface AuthUser {
    id: string;
    email: string;
    username: string;
    name: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
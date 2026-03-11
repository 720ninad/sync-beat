import { Router } from 'express';
import {
    searchUsers,
    sendFriendRequest,
    getFriendRequests,
    acceptFriendRequest,
    declineFriendRequest,
    getFriends,
    removeFriend,
    pingPresence,
    goOffline,
    getFriendCount,
} from '../controllers/friends.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/search', searchUsers);
router.get('/count', getFriendCount);
router.get('/requests', getFriendRequests);
router.get('/', getFriends);
router.post('/request', sendFriendRequest);
router.put('/request/:id/accept', acceptFriendRequest);
router.put('/request/:id/decline', declineFriendRequest);
router.delete('/:id', removeFriend);
router.post('/ping', pingPresence);
router.post('/offline', goOffline);

export default router;
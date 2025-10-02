import { Router } from 'express';
import { ContactsController } from '../controllers/contacts';

const router = Router();
const contactsController = new ContactsController();

// CardDAV endpoints
router.options('*', contactsController.options);
router.all('/', (req, res, next) => {
  if (req.method === 'PROPFIND') {
    contactsController.propfind(req, res);
  } else {
    next();
  }
});
router.get('/:contactId', contactsController.getContact);
router.put('/:contactId', contactsController.putContact);
router.delete('/:contactId', contactsController.deleteContact);

export default router;
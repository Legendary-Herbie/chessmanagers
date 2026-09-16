import createDOMPurify from 'dompurify';
import { configureAnnouncementPurifier } from '../../../server/shared/announcementHtml.js';

export const sanitizeAnnouncementHtml = configureAnnouncementPurifier(createDOMPurify(window));

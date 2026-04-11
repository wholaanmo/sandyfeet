import { sendTransactionalEmail } from './mailer';
import {
  buildRoomConfirmationEmail,
  buildRoomCancellationEmail,
  buildRefundNotificationEmail as refundTemplate,
  buildMoveDateNotificationEmail,
  buildDayTourConfirmationEmail,
  buildDayTourCancellationEmail,
} from './emailTemplates';

const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function sendRefundNotificationEmail(booking) {
  const { to, subject, html } = refundTemplate(booking);
  return sendTransactionalEmail({ to, subject, html });
}

export async function sendMoveDateNotificationEmail(booking) {
  const { to, subject, html } = buildMoveDateNotificationEmail(booking, baseUrl());
  return sendTransactionalEmail({ to, subject, html });
}

export async function sendRoomConfirmationEmail(booking) {
  const { to, subject, html } = buildRoomConfirmationEmail(booking, baseUrl());
  return sendTransactionalEmail({ to, subject, html });
}

export async function sendRoomCancellationEmail(booking, reason, cancelledBy = 'admin') {
  const { to, subject, html } = buildRoomCancellationEmail(booking, reason, cancelledBy, baseUrl());
  return sendTransactionalEmail({ to, subject, html });
}

export async function sendDayTourConfirmationEmailServer(booking) {
  const { to, subject, html } = buildDayTourConfirmationEmail(booking);
  return sendTransactionalEmail({ to, subject, html });
}

export async function sendDayTourCancellationEmailServer(booking, reason, cancelledBy = 'admin') {
  const { to, subject, html } = buildDayTourCancellationEmail(booking, reason, cancelledBy);
  return sendTransactionalEmail({ to, subject, html });
}

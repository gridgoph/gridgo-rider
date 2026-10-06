Delivery payment gate regression screenshots, using the real Expo web delivery screen with synthetic API responses. No customer or production data is shown.

- Phone: 390 × 844; desktop: 1440 × 1000; Light theme.
- `before-*`: reproduce the previous gate by removing `not_required` from the settled statuses in the browser's development bundle response. The warning title uses the previous wording; remaining copy uses the current screen.
- `after-*`: `initial` confirmed and `final_online` set to `not_required`, amount zero. The camera is enabled and the payment warning disappears. Confirm delivery still requires stored evidence.
- `pending-phone`: a real balance in `pending_confirmation` retains the warning and disables capture and confirmation.

Stored evidence and successful delivery submission are covered by `app/__tests__/deliveryPayment.test.js`. These browser checks do not verify the native camera.

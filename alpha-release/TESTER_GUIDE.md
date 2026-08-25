# STARLADDER Alpha 8.0 tester guide

## Supported system

- Windows 10 or Windows 11, 64-bit
- Internet connection
- Public RSI Citizen Dossier for account verification
- Star Citizen is not modified, injected into, or automated by STARLADDER

## Installation

1. Download the Alpha 8.0 ZIP only from the public official STARLADDER GitHub Releases page.
2. Compare the ZIP checksum with `SHA256SUMS.txt`.
3. Extract every file before opening STARLADDER.
4. Run `STARLADDER.exe`.
5. Windows SmartScreen may warn that the publisher is unknown because this closed alpha is intentionally unsigned.

## First test session

1. Create an account using a unique password.
2. Add the displayed STARLADDER code to the Bio field of your public RSI Citizen Dossier.
3. Verify that your STARLADDER display name becomes your verified RSI handle.
4. Select and test the screenshot hotkey once. STARLADDER remembers it on this Windows account across updates.
5. Join the 1v1 queue alone. Test 3v3 and 5v5 only with an exact-size party.
6. Send a channel message, create or join a party, and check notifications.
7. Restart STARLADDER and confirm only one window opens and screenshot setup does not return.
8. Open Missions and Channels, restart STARLADDER, and confirm their unseen indicators remain cleared.
9. As staff, confirm ordinary result submissions create no alert; dispute a result and confirm it appears under the top bell and Admin → Match Disputes.
10. In Settings, leave Background Chat Notifications enabled and select Minimize & Test Chat Alert. Confirm STARLADDER minimizes and a native Windows notification appears; then disable the setting and confirm the test action is unavailable.
11. Click the eligible ranked queue and confirm the card changes to CONNECTING immediately, becomes SEARCHING after cloud confirmation, and cancels without a frozen cursor.
12. Create one personal channel and one organization channel, invite another verified RSI pilot, and confirm only members can see and use each channel.
13. Confirm the channel owner can promote an admin, both can invite/remove ordinary members, a non-owner can leave, and the owner can delete the channel.
14. As a channel creator, apply each timeout duration and confirm the affected member can still read the channel but cannot post. Lift the timeout, confirm posting resumes, then test Kick.
15. Promote a channel admin and confirm they can moderate ordinary members but cannot kick or time out the creator or another admin.

## Evidence privacy

Screenshots are stored under `Pictures\STARLADDER\Captures`. They are not uploaded automatically. Review every screenshot before sharing it and remove personal information from other applications or displays.

## Reporting a problem

Use `TESTER_REPORT.md`. Include the STARLADDER version, Windows version, expected result, actual result, and exact reproduction steps. Attach screenshots only after checking them for personal information.

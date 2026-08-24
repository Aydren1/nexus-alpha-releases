# NEXUS Alpha 7.5 tester guide

## Supported system

- Windows 10 or Windows 11, 64-bit
- Internet connection
- Public RSI Citizen Dossier for account verification
- Star Citizen is not modified, injected into, or automated by NEXUS

## Installation

1. Download the Alpha 7.5 ZIP only from the official release link provided by Cero.
2. Compare the ZIP checksum with `SHA256SUMS.txt`.
3. Extract every file before opening NEXUS.
4. Run `NEXUS.exe`.
5. Windows SmartScreen may warn that the publisher is unknown because this closed alpha is intentionally unsigned.

## First test session

1. Create an account using a unique password.
2. Add the displayed NEXUS code to the Bio field of your public RSI Citizen Dossier.
3. Verify that your NEXUS display name becomes your verified RSI handle.
4. Select and test the screenshot hotkey once. NEXUS remembers it on this Windows account across updates.
5. Join the 1v1 queue alone. Test 3v3 and 5v5 only with an exact-size party.
6. Send a channel message, create or join a party, and check notifications.
7. Restart NEXUS and confirm only one window opens and screenshot setup does not return.
8. Open Missions and Channels, restart NEXUS, and confirm their unseen indicators remain cleared.
9. As staff, confirm ordinary result submissions create no alert; dispute a result and confirm it appears under the top bell and Admin → Match Disputes.
10. In Settings, leave Background Chat Notifications enabled and select Minimize & Test Chat Alert. Confirm NEXUS minimizes and a native Windows notification appears; then disable the setting and confirm the test action is unavailable.
11. Click the eligible ranked queue and confirm the card changes to CONNECTING immediately, becomes SEARCHING after cloud confirmation, and cancels without a frozen cursor.

## Evidence privacy

Screenshots are stored under `Pictures\NEXUS\Captures`. They are not uploaded automatically. Review every screenshot before sharing it and remove personal information from other applications or displays.

## Reporting a problem

Use `TESTER_REPORT.md`. Include the NEXUS version, Windows version, expected result, actual result, and exact reproduction steps. Attach screenshots only after checking them for personal information.

# DrivePlayer

A desktop app to play google drive files locally securly, there is no backend and all the data are stored client side

Download it from release: https://github.com/kiran-venugopal/DrivePlayer/releases

<a href="https://www.producthunt.com/products/driveplayer?embed=true&amp;utm_source=embed&amp;utm_medium=post_embed" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; padding: 8px 16px; background: rgb(255, 97, 84); color: rgb(255, 255, 255); text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Check it out on Product Hunt →</a>




<img width="1470" height="924" alt="Screenshot 2026-09-23 at 1 05 20 AM" src="https://github.com/user-attachments/assets/ea0e98f7-977c-4315-a032-82889b9a17bf" />
<img width="1468" height="925" alt="Screenshot 2026-09-23 at 1 05 43 AM" src="https://github.com/user-attachments/assets/f4de1d9b-d875-48bc-aa79-aafdfc1aaab8" />



## macOS Installation & Gatekeeper Fix

When installing on macOS, Gatekeeper may display a prompt stating:
> *"DrivePlayer cannot be opened because Apple cannot check it for malicious software"* or *"contains malware / damaged"*.

This occurs on modern macOS (Sonoma & Sequoia) for open-source apps built without a paid Apple Developer certificate.

### How to open the app on Mac:

**Option 1: One-Line Terminal Fix (Recommended)**
After dragging `DrivePlayer.app` to your `/Applications` folder, open Terminal and run:
```bash
xattr -cr /Applications/DrivePlayer.app
```
*(Or run `xattr -cr DrivePlayer-1.0.0-arm64.dmg` before mounting the DMG)*

**Option 2: System Settings**
1. Open **System Settings** → **Privacy & Security**.
2. Scroll down to **Security**.
3. Under *"DrivePlayer was blocked from use..."*, click **Open Anyway**.

**Option 3: Right-Click Open**
1. In Finder, open `/Applications`.
2. Right-click (or Control-click) **DrivePlayer.app** and select **Open**.
3. Click **Open** in the confirmation dialog.

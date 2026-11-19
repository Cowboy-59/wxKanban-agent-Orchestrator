---
id: kain-signin
part: web-app
audience: customer
sources: specs/152-kain-signin-agent-reach/spec.md, docs/kain-contract.md
---
# Signing K.A.I.N. in

K.A.I.N. is the remote agent that supervises your projects from your phone or laptop. It signs in as you, with your own wxKanban email and password. It can reach only what you can reach, and only on projects that allow it.

## Signing in

1. Open K.A.I.N. on your phone or laptop.
2. Enter your wxKanban email and password, and a name for the device, such as "Andy's phone".
3. K.A.I.N. is signed in. wxKanban does not keep your password, and K.A.I.N. only holds a device key.

Use a different device name for each phone or laptop. Signing in again with the same name replaces that device's key and leaves your other devices alone. If your account is locked, wait and try again. There is no second sign-in step yet, the same as the web app.

## What K.A.I.N. can reach

K.A.I.N. reaches a project only when all of these are true:

- You can reach it. If you are an Admin of your company, that is every project of the company. Otherwise it is the projects you are assigned to, or where you lead a phase that is in progress.
- The project has **Allow remote** turned on.
- The project is not archived.

Settings that only change what you see on screen, such as "show all", do not widen what K.A.I.N. can reach.

## Consultants and client projects

If you work for a consulting company, K.A.I.N. can also reach your clients' projects:

- If you are an Admin or Manager at the consulting company, you reach every project your company is assigned to as a whole project, while the engagement is active.
- Other consulting members reach only the projects they are personally assigned to.
- Assignments to a single scope or task grant nothing.
- A paused, disabled or ended engagement grants nothing.

Your own company's projects come first in K.A.I.N.'s list, then each client company by name.

## See and revoke your devices

1. Open [Settings](settings.md) and go to **Profile**.
2. Find **My K.A.I.N. devices**. Each row shows the device name, when it signed in, and when it was last used.
3. Click **Revoke** on a device and confirm.

A revoked device is signed out on its next call and must sign in again. Your device is also signed out if you change or reset your password, or if you are deactivated or leave the company.

## Revoking a team member's device (Admins)

An Admin can open Settings, **Company**, and see every member's K.A.I.N. devices. Click **Revoke** on any device to sign it out at once. Do this when a phone is lost or someone changes roles.

## What a client controls

A client company stays in charge of its own projects. Any of these stops K.A.I.N. on the next call:

- Turning **Allow remote** off on the project.
- Pausing or ending the consulting engagement.
- Removing the person's assignment.
- Deactivating the person, or revoking their device.

On a project's Agent Access panel the client sees a read-only line, for example "Reachable by: your team, and consultants of Acme Consulting (engagement)". It names companies only, never people. Each time K.A.I.N. connects, the client's audit log records it, so the client can see whose K.A.I.N. connected.

## Common tasks

1. **Sign K.A.I.N. in:** enter your wxKanban login and a device name.
2. **Let K.A.I.N. reach a project:** turn **Allow remote** on for that project.
3. **Stop K.A.I.N. on a project:** turn **Allow remote** off.
4. **Sign out a lost phone:** Settings, Profile, **My K.A.I.N. devices**, **Revoke**.

## Fields and what they show

- **My K.A.I.N. devices** — your signed-in devices (Settings, Profile).
- **Device name** — the name you gave when you signed in.
- **Signed in** — when the device signed in.
- **Last used** — the last time K.A.I.N. made a call from it.
- **Revoke** — signs the device out. Asks you to confirm.
- **Allow remote** — the project switch that lets K.A.I.N. reach the project.
- **Reachable by** — read-only; which companies can reach the project.

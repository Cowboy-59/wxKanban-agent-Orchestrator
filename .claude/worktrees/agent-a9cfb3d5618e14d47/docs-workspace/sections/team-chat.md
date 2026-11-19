---
id: team-chat
part: web-app
audience: customer
sources: specs/144-company-yappchatt-account/spec.md, specs/144-company-yappchatt-account/contracts.md, src/client/components/company/TeamChatPanel.tsx
---
# Team chat (YappChatt)

Team chat gives your company its own YappChatt account. Every project's chat room belongs to that account, and your whole team is in it. That includes the room where the project agent and KAIN post their questions, so the right people can see and answer them.

## Where it is

Open [Settings](settings.md) and stay on the **Company** tab. The **Team chat (YappChatt)** panel is on that tab. Only an Admin sees the Company tab.

## What you're looking at

The panel shows one of these:

- **YappChatt account: not connected**, with a **Create YappChatt account** button. Your company has no account yet.
- **Connected:** followed by an email, such as `info@example.com`, with the account's **YappChatt id** below it. Your company's account is set up.
- **YappChatt isn't ready for this yet — try again later.** YappChatt's side of this feature is not available right now. Nothing was changed. Try again later.

## Creating the account

1. Click **Create YappChatt account**.
2. A box asks you to confirm, and shows the email it will use. That is always your company's contact email, the **Billing Email** under **Company Information** on the same tab. To use a different email, change it there and save first.
3. Click **Create account**.

What happens next:

- **New account.** If that email has no YappChatt account, one is created and YappChatt sends that email a welcome message with a link to set a password.
- **Existing account.** If that email already has a YappChatt account, it is linked instead, and a box tells you which account it is. No second account is created.
- **Already connected.** Clicking again on a connected company changes nothing.

wxKanban then creates your company's group in YappChatt and adds your people to it directly, with no invitations to accept. The panel shows how many members were added, updated and removed. If anyone could not be added, they are listed with the reason. For example, the group can be full when your plan has no seats left.

## Who is in the group and the rooms

wxKanban decides who is in the chat, from your company's own records:

| Person | Company group | Project rooms |
| --- | --- | --- |
| Your company's users ([Team Members](team.md)) | Yes | Every project room |
| Consultants from an engaged consulting firm | Yes, while they work on one of your projects | Only the rooms of the projects they are assigned to |
| Anyone else | No | No |

wxKanban keeps this up to date for you. A person is added or removed when they join or leave your company, when a consulting engagement starts or ends, and each time a project agent connects. Someone you remove from the company is taken out of the group and every project room. If someone is added to or removed from a project room or the group by hand in YappChatt, wxKanban changes it back at the next update.

Other rooms in your company account, the ones that are not project rooms, are not managed by wxKanban. An Admin invites people to those in YappChatt.

## Project rooms

Each project has one room, named after the project with " · KAIN" added (for a project called Billing, "Billing · KAIN"). It is created the first time a project agent connects, under your company's account, never under one person's account.

If your company has no YappChatt account yet, no room is created. The project agent asks whether to create the account now, using your contact email. If the answer is no, it stops and creates nothing.

Rooms made before this feature belonged to whoever connected first. Each one is retired the next time an agent connects to its project, and a new company room replaces it. A retired room keeps its history but takes no new messages.

## Who can decide in a room

KAIN no longer uses a Company Access Token or a per-project tick. Each person signs KAIN in with their own wxKanban login, and a project's **Agent Access** panel keeps one switch, **Allow remote**, plus a read-only **Reachable by** line. See [Signing K.A.I.N. in](kain-signin.md).

Everyone in a room can read and post. Only a **Room Approver** can answer a parked question (`DQ-01: …`) or review KAIN's answer (`KR-0001 approve`):

- a company **Admin**, or
- a **Manager** who is a member of that project.

The decision is recorded under that person's name. A reply from anyone else is passed to the project agent as discussion and is not recorded, and the room says so. KAIN is never a Room Approver. See [Decision memory](process-decision-memory.md).

## Community Help in the Cockpit

Community Help in VS Code opens a chat session only for people in your company. It sends your project's token along with your email. A session is opened only when that email belongs to one of your company's users, or to a consultant assigned to one of your projects. Any other email gets "This email isn't a member of your company", and the attempt is recorded.

## Everything is recorded

Every change is written to the company audit log: the account created or linked, each person added or removed, each room created or retired, each refused chat session, and each decision accepted or refused in a room.

## Common tasks

1. **Set up team chat:** in Settings, Company tab, check the Billing Email, then click **Create YappChatt account** and confirm.
2. **Add someone to the chat:** add them to your company on [Team Members](team.md), or assign their consulting firm's member to the project. wxKanban adds them.
3. **Take someone out of the chat:** remove them from your company, or end or change their assignment. wxKanban removes them.
4. **Stop KAIN reaching a project:** turn **Allow remote** off on the project's Agent Access panel. To stop one person's device, revoke it in Settings (see [Signing K.A.I.N. in](kain-signin.md)).
5. **Let someone decide in a project room:** make them a Manager and a member of that project, or an Admin.

## Fields and what they show

- **YappChatt account: not connected** — your company has no YappChatt account yet.
- **Create YappChatt account** — creates or links the account from the contact email. Admins only.
- **Connected:** — the email the company account was made from.
- **YappChatt id** — the company account's id in YappChatt.
- **Group members: added, updated, removed** — what the last setup changed in the group.
- **Not added** list — people who could not be added, with the reason.

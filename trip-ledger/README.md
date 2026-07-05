# Trip Ledger

A shared trip-expense tracker for 6 friends: each person logs their deposit
to the trip pool and their own personal spends (with photo/PDF proof and an
automatic timestamp); the admin also logs spends paid from the pool. Updates
sync to everyone in real time.

This is a React + Vite app backed by Firebase (Firestore), deployable for
free on GitHub Pages.

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Name it anything (e.g. `trip-ledger`). You can skip Google Analytics.
2. Once created, click the **`</>`** (web) icon to register a web app. Give it a nickname — you don't need Firebase Hosting.
3. Firebase will show you a `firebaseConfig` object with values like `apiKey`, `authDomain`, etc. **Keep this page open**, you'll need these values in step 3.
4. In the left sidebar, go to **Build → Firestore Database → Create database**. Choose **Start in production mode**, pick any region close to you, and click Create.
5. Go to the **Rules** tab of Firestore and replace the contents with what's in [`firestore.rules`](./firestore.rules) in this repo, then click **Publish**.

That's it on the Firebase side — no billing/credit card needed for this setup (proofs are stored as compressed images directly in Firestore, not in Cloud Storage, which avoids needing the paid plan).

## 2. Run it locally (optional but recommended first)

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in the 6 values from your `firebaseConfig` (step 1.3), matching each `VITE_FIREBASE_...` line.

```bash
npm run dev
```

Open the printed `localhost` URL. The first time, it'll ask you to set up the trip (name, 6 friends, who's admin) — that data is now live in your Firestore project for everyone.

## 3. Put it on GitHub

1. Create a new **public or private** repo on GitHub and push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Trip ledger"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Secrets and variables → Actions → New repository secret**, and add these 6 secrets (same names as `.env.example`, values from your Firebase config):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Go to **Settings → Pages**, and under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push any commit to `main` (or re-run the workflow from the **Actions** tab). The included workflow (`.github/workflows/deploy.yml`) will build the site with your secrets baked in and publish it.
5. Once the workflow finishes, your site will be live at `https://<your-username>.github.io/<your-repo>/`. Share that link with your 5 friends — everyone opening it sees and edits the same shared trip data.

## How data is stored

- `config/trip` — trip name, the 6 names, who's admin.
- `deposits/<name>` — one document per person, so two people editing deposits at the same time never overwrite each other.
- `spends/<auto-id>` — one document per spend (personal or pool), including the proof image/PDF encoded directly in the document.

Real-time listeners (`onSnapshot`) push every change to all open devices automatically — no manual refresh needed. The app also works offline for short stretches (e.g. patchy signal) and syncs once the connection comes back.

## Known limits

- Proofs are capped at roughly **700KB** after compression (Firestore's 1MB-per-document limit). Photos are auto-compressed and almost always fit; very large PDFs may not — if that's a problem, the next step would be moving proofs to Firebase Cloud Storage instead of inline Firestore fields (requires upgrading to Firebase's pay-as-you-go Blaze plan, which still has a generous free quota).
- The Firestore rules in this repo are **open** (anyone with the project ID can read/write) to avoid building a login system. Fine for a private friends' trip; don't reuse this setup for sensitive data.
- There's no per-user login — "who you are" is just a local choice on each person's own device/browser.

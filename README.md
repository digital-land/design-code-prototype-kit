# design-code-prototype-kit
Contains prototype pages for design codes they can be exported into the platform at a later date once user testing is done

## Run locally

1. Install Node.js 26 and npm. If you use nvm, run `nvm use` to pick up the
   version in `.nvmrc`.
2. Install the project dependencies:

   ```sh
   npm install
   ```

3. Start the prototype:

   ```sh
   npm run dev
   ```

## Deploy to Heroku

The `Procfile` starts the prototype with `npm start`, and `package.json` pins
Node.js 26 (LTS). Heroku sets `NODE_ENV=production` and `PORT` for you, so the
Prototype Kit turns on password protection and redirects to HTTPS.

Set these config vars in the Heroku app:

| Name | Required | Purpose |
| --- | --- | --- |
| `PASSWORD` | Yes | Password participants enter to view the prototype. Without it the site shows an error page. |

Deployments are handled automatically by Heroku on pushes to main.

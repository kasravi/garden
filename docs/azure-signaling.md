# Deploy the signaling server to Azure Web Apps

This repo now uses one clean deployment path for signaling:

- Azure Web App for Containers
- your own container image built from [Dockerfile.signal](../Dockerfile.signal)
- a built-in default signaling URL: `wss://garden-signal.azurewebsites.net`

For this app, the signaling server is tiny. It is only used for peer discovery. The real data path stays browser-to-browser over WebRTC, and local state stays in IndexedDB.

## What stays in the repo

- [Dockerfile.signal](../Dockerfile.signal) for the signaling server container
- the `signal` npm script in [package.json](../package.json)
- this Azure deployment guide

All Fly and Azure Container Apps files have been removed.

## Recommended portal setup

Create these resources manually in the Azure portal:

1. An App Service plan
	- OS: Linux
	- Region: whichever region you prefer
	- Pricing tier: `Free (F1)`
2. A Web App
	- Publish: Docker Container
	- Operating system: Linux
	- App Service plan: the free plan above

If Azure ever tells you the container setup needs a higher plan, you can scale the same app up later. For now, start with `F1`.

## Step 1: publish the signaling image

You need a public container image for [Dockerfile.signal](../Dockerfile.signal).

The easiest option is a public image on `ghcr.io`.

Current image:

- `ghcr.io/kasravi/garden-signal:amd64`

The image only needs to run:

- `npm run signal`
- port `4444`

That is already what [Dockerfile.signal](../Dockerfile.signal) does.

## Step 2: create the Web App in the portal

In the Azure portal:

1. Create the App Service plan on Linux using `F1`
2. Create a Web App using Docker Container publishing
3. Point it at your published image

Suggested app name:

- `garden-signal`

Your default hostname will look like:

- `https://garden-signal.azurewebsites.net`

## Step 3: configure app settings

In the Web App configuration, set these application settings:

- `WEBSITES_PORT=4444`
- `PORT=4444`
- `WEBSITES_ENABLE_APP_SERVICE_STORAGE=false`

App Service needs `WEBSITES_PORT` because the container listens on `4444` instead of `80`.

## Step 4: enable WebSockets

In the Web App settings, enable WebSockets.

That is required for the signaling service.

## Step 5: verify the deployed signal server

Open your deployed app in the browser:

- `https://your-app-name.azurewebsites.net`

It should return:

```txt
okay
```

## Step 6: use the built-in frontend default

The app now points at the deployed signaling server by default:

- `wss://garden-signal.azurewebsites.net`

No frontend env variable is required for local development or GitHub Pages.

## Step 7: test collaboration

1. Open the app in two browsers or two devices
2. Join the same garden code
3. Confirm each browser sees the other online

## Troubleshooting

If peers do not discover each other:

1. Confirm the app loads at `https://your-app-name.azurewebsites.net`
2. Confirm the container is using port `4444`
3. Confirm `WEBSITES_PORT=4444`
4. Confirm WebSockets are enabled in the Web App
5. Confirm `https://garden-signal.azurewebsites.net` returns `okay`

## Notes

- The signaling server is not your database.
- Losing the signal server only affects peer discovery, not the local IndexedDB data already stored in the app.
- If you ever outgrow the free tier, you can scale the same Web App up later without changing the app architecture.

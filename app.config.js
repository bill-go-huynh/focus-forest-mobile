// The static config is app.json; this only adds what must not live in git.
// Firebase (push on Android, W.4): EAS builds read the file from the GOOGLE_SERVICES_JSON file
// variable (`eas env`); a local build or `expo start` uses ./google-services.json if present.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});

// Configuration Fleek v2
// Doc : https://fleek.xyz/docs/cli/sites/
// ⚠️ Remplacer 'your-billboard' par votre slug Fleek après création du site

export default {
  sites: [
    {
      slug: 'w00-board',
      distDir: 'dist',
      buildCommand: 'npm run build',
      buildEnv: {
        NODE_VERSION: '20',
      },
    },
  ],
};

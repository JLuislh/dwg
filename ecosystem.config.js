module.exports = {
  apps: [{
    name: 'visor-pn',
    script: 'server.js',
    cwd: __dirname,
    env: {
      PORT: 3000,
      PATH_DRAWINGS: '/mnt/nas/drawings',
      PATH_FOTOS: '/mnt/nas/fotos'
    },
    max_memory_restart: '500M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    time: true
  }]
};

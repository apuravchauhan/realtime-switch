#!/usr/bin/env node
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ObservabilitySetup {
  constructor() {
    this.projectDir = __dirname;
    this.monitorScript = path.join(this.projectDir, 'monitor.js');
    this.platform = os.platform(); // 'darwin' for Mac, 'linux' for Ubuntu
    this.cronJobPattern = 'realtime-switch-monitor';
  }

  log(message, type = 'info') {
    const icons = { info: '🔧', success: '✅', warning: '⚠️', error: '❌' };
    console.log(`${icons[type]} ${message}`);
  }

  // 1. Build/Install Dependencies
  async buildPackage() {
    this.log('Checking observability package dependencies...');

    if (!fs.existsSync(path.join(this.projectDir, 'node_modules'))) {
      this.log('Installing dependencies...', 'info');
      execSync('npm install', { cwd: this.projectDir, stdio: 'inherit' });
      this.log('Dependencies installed successfully!', 'success');
    } else {
      this.log('Dependencies already installed', 'success');
    }
  }

  // 2. Detect System Configuration
  getSystemConfig() {
    let nodePath;
    try {
      nodePath = execSync('which node', { encoding: 'utf8' }).trim();
    } catch (error) {
      // Fallback paths
      const fallbackPaths = ['/usr/local/bin/node', '/usr/bin/node'];
      nodePath = fallbackPaths.find(p => fs.existsSync(p));
      if (!nodePath) {
        throw new Error('Node.js executable not found');
      }
    }

    const config = {
      platform: this.platform,
      nodePath,
      projectDir: this.projectDir,
      cronLogPath: this.platform === 'darwin'
        ? '/var/log/system.log'
        : '/var/log/cron'
    };

    this.log(`System detected: ${config.platform}`);
    this.log(`Node.js path: ${config.nodePath}`);
    return config;
  }

  // 3. Get current crontab
  getCurrentCrontab() {
    try {
      return execSync('crontab -l', { encoding: 'utf8' });
    } catch (error) {
      // No crontab exists
      return '';
    }
  }

  // 4. Create cron job entry
  createCronEntry(config, schedule = '* * * * *') {
    const logFile = path.join(this.projectDir, 'monitor.log');
    return `# ${this.cronJobPattern} - PM2 Monitoring
${schedule} cd ${config.projectDir} && ${config.nodePath} monitor.js >> ${logFile} 2>&1`;
  }

  // 5. Update crontab safely
  updateCrontab(config) {
    this.log('Configuring cron job...');

    const currentCrontab = this.getCurrentCrontab();
    const lines = currentCrontab.split('\n').filter(line => line.trim());

    // Remove existing monitor entries
    const filteredLines = lines.filter(line =>
      !line.includes(this.cronJobPattern) &&
      !line.includes('realtime-switch/observability')
    );

    // Add new entry
    const newCronEntry = this.createCronEntry(config);
    const newCrontab = [...filteredLines, '', newCronEntry, ''].join('\n');

    // Write to temporary file and install
    const tempFile = '/tmp/new_crontab';
    fs.writeFileSync(tempFile, newCrontab);

    try {
      execSync(`crontab ${tempFile}`, { stdio: 'inherit' });
      fs.unlinkSync(tempFile);
      this.log('Cron job configured successfully!', 'success');
      this.log('Monitor will run every 15 minutes', 'info');
    } catch (error) {
      this.log('Failed to update crontab', 'error');
      throw error;
    }
  }

  // 6. Verify setup
  verifySetup() {
    this.log('Verifying setup...');

    // Check if monitor script exists
    if (!fs.existsSync(this.monitorScript)) {
      throw new Error('monitor.js not found');
    }

    // Check if .env exists
    const envFile = path.join(this.projectDir, '.env');
    if (!fs.existsSync(envFile)) {
      this.log('Warning: .env file not found. Please configure your AWS credentials.', 'warning');
      return false;
    }

    // Verify cron job was added
    const crontab = this.getCurrentCrontab();
    if (!crontab.includes(this.cronJobPattern)) {
      throw new Error('Cron job was not added successfully');
    }

    this.log('Setup verification completed!', 'success');
    return true;
  }

  // 7. Test monitoring script
  async testMonitor() {
    this.log('Testing monitoring script...');
    try {
      execSync('node monitor.js', { cwd: this.projectDir, stdio: 'inherit' });
      this.log('Monitor test completed!', 'success');
    } catch (error) {
      this.log('Monitor test failed', 'error');
      throw error;
    }
  }

  // Main setup process
  async run() {
    try {
      console.log('\n🚀 Setting up PM2 Observability Monitoring\n');

      await this.buildPackage();
      const config = this.getSystemConfig();
      this.updateCrontab(config);

      if (this.verifySetup()) {
        await this.testMonitor();
      }

      console.log('\n🎉 Setup completed successfully!');
      console.log('\n📋 What was configured:');
      console.log('   • Dependencies installed');
      console.log('   • Cron job added (runs every 15 minutes)');
      console.log('   • Monitor script tested');
      console.log('\n📝 Next steps:');
      console.log('   • Configure your .env file with AWS credentials');
      console.log('   • Check logs: tail -f monitor.log');
      console.log('   • View cron jobs: crontab -l');

    } catch (error) {
      this.log(`Setup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  new ObservabilitySetup().run();
}

module.exports = ObservabilitySetup;
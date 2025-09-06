# @realtime-switch/observability

PM2 monitoring and observability package for the realtime-switch platform. Automatically monitors PM2 processes and sends email alerts with system metrics.

## 🚀 Quick Setup

### 1. Run the automated setup:
```bash
cd realtime-switch/observability
npm run setup
```

This single command will:
- ✅ Install all dependencies
- 🖥️ Detect your system (Mac/Ubuntu)
- 📧 Configure email monitoring
- ⏰ Set up automated cron job
- ✅ Verify everything works

### 2. Configure your environment:
Make sure your `.env` file has the correct AWS SES credentials:
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-2
FROM_EMAIL=noreply@realtimeswitch.com
TO_EMAIL=your-email@domain.com
```

## 📧 How It Works

The setup creates a **cron job** that runs every minute and monitors your PM2 processes:

1. **Connects to PM2** - Gets process status, CPU, memory, restarts
2. **Collects system metrics** - CPU load, memory usage, uptime
3. **Sends email report** - Via AWS SES with detailed status
4. **Logs everything** - Saves output to `monitor.log`

### Example Email Report:
```
PM2 Monitoring Report
=====================

Timestamp: 2025-09-04T19:48:56.783Z
Server: your-hostname

Process Status
--------------
Name: rs-server
Status: online
Restarts: 2
Uptime: 314s
CPU Usage: 0.1%
Memory Usage: 43MB

System Status
-------------
System CPU Load: 1.82
System Memory: 99.6%
System Uptime: 24h
```

## 🛠️ Manual Commands

### Run monitor once:
```bash
npm run monitor
# OR
node monitor.js
```

### Test setup without cron:
```bash
node setup.js
```

## ⏰ Cron Management

### View current cron jobs:
```bash
crontab -l
```

### Edit cron jobs manually:
```bash
crontab -e
```

### Remove ALL cron jobs (⚠️ destructive):
```bash
crontab -r
```

### Remove only monitoring cron jobs:
```bash
crontab -l | grep -v "realtime-switch-monitor" | crontab -
```

### Current cron schedule:
```bash
# Runs every minute:
* * * * * cd /path/to/observability && node monitor.js >> monitor.log 2>&1
```

## 📊 PM2 Commands Reference

### Basic PM2 monitoring:
```bash
pm2 list            # Simple table view
pm2 prettylist      # Detailed human-readable format  
pm2 jlist           # Raw JSON data (for scripts)
```

### Process management:
```bash
pm2 start ecosystem.config.js    # Start processes
pm2 stop rs-server              # Stop specific process
pm2 restart rs-server           # Restart process
pm2 delete rs-server            # Stop and remove process
```

### Log monitoring:
```bash
pm2 logs rs-server              # Live tail logs
pm2 logs rs-server --lines 100  # Last 100 lines
pm2 flush                       # Clear all logs
```

### Real-time monitoring:
```bash
pm2 monit           # Real-time dashboard
pm2 web             # Web interface (port 9615)
```

### PM2 status details:
```bash
pm2 describe rs-server          # Detailed process info
pm2 show rs-server              # Same as describe
```

## 📁 File Structure

```
observability/
├── README.md           # This file
├── package.json        # Dependencies and scripts
├── setup.js           # Automated setup script  
├── monitor.js         # Main monitoring script
├── .env               # Your AWS credentials
├── .env.example       # Example configuration
└── monitor.log        # Cron job output logs
```

## 🔧 How Setup Works Internally

The `setup.js` script performs these steps:

### 1. **Dependency Check**
- Checks if `node_modules` exists
- Runs `npm install` if needed

### 2. **System Detection**
- Detects OS: `darwin` (Mac) or `linux` (Ubuntu)
- Finds Node.js path: `/usr/local/bin/node` or `/usr/bin/node`
- Sets appropriate log paths

### 3. **Cron Configuration**
- Gets current crontab: `crontab -l`
- Removes existing monitoring entries safely
- Adds new cron job with proper paths
- Updates crontab: `crontab /tmp/new_crontab`

### 4. **Verification**
- Tests PM2 connection
- Verifies cron job was added
- Runs monitor script once
- Checks `.env` file exists

## 📝 Troubleshooting

### Check if cron is running:
```bash
ps aux | grep cron
```

### View cron logs:
```bash
# Mac
tail -f /var/log/system.log | grep cron

# Ubuntu  
tail -f /var/log/cron
```

### Check monitoring logs:
```bash
tail -f monitor.log
```

### Test email sending:
```bash
node monitor.js
```

### Verify PM2 connection:
```bash
pm2 list
```

## ⚠️ Notes

- **Cron persists across reboots** - No need to reconfigure after server restart
- **Safe to re-run setup** - Will update existing configuration
- **Cross-platform** - Works on Mac and Ubuntu
- **Email frequency** - Every minute (avoid shorter intervals to prevent spam)
- **Log rotation** - Consider setting up log rotation for `monitor.log`

## 🆘 Support

If you encounter issues:
1. Check `.env` configuration
2. Verify PM2 is running: `pm2 list`
3. Test AWS SES credentials
4. Check cron logs for errors
5. Run `node monitor.js` manually for debugging
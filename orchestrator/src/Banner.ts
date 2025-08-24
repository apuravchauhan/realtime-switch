export class Banner {
  private static readonly colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
  };

  static displayStartupBanner(): void {
    const { yellow, white, green, reset, bold } = this.colors;

    console.log(`${yellow}${bold}
  ▗▄                ▗▄▖         █             ▗▄▖        █            ▗▖                        ▄▖  
  █                 ▝▜▌   ▐▌    ▀            ▗▛▀▜        ▀   ▐▌       ▐▌                         █  
  █   █▟█▌ ▟█▙  ▟██▖ ▐▌  ▐███  ██  ▐█▙█▖ ▟█▙ ▐▙   █   █ ██  ▐███  ▟██▖▐▙██▖      ▟██▖ ▟█▙ ▐█▙█▖  █  
  █   █▘  ▐▙▄▟▌ ▘▄▟▌ ▐▌   ▐▌    █  ▐▌█▐▌▐▙▄▟▌ ▜█▙ ▜ █ ▛  █   ▐▌  ▐▛  ▘▐▛ ▐▌     ▐▛  ▘▐▛ ▜▌▐▌█▐▌  █  
 ▀▙   █   ▐▛▀▀▘▗█▀▜▌ ▐▌   ▐▌    █  ▐▌█▐▌▐▛▀▀▘   ▜▌▐▙█▟▌  █   ▐▌  ▐▌   ▐▌ ▐▌     ▐▌   ▐▌ ▐▌▐▌█▐▌  ▟▀ 
  █   █   ▝█▄▄▌▐▙▄█▌ ▐▙▄  ▐▙▄ ▗▄█▄▖▐▌█▐▌▝█▄▄▌▐▄▄▟▘▝█ █▘▗▄█▄▖ ▐▙▄ ▝█▄▄▌▐▌ ▐▌  █  ▝█▄▄▌▝█▄█▘▐▌█▐▌  █  
  █   ▀    ▝▀▀  ▀▀▝▘  ▀▀   ▀▀ ▝▀▀▀▘▝▘▀▝▘ ▝▀▀  ▀▀▘  ▀ ▀ ▝▀▀▀▘  ▀▀  ▝▀▀ ▝▘ ▝▘  ▀   ▝▀▀  ▝▀▘ ▝▘▀▝▘  █  
  ▜▄                                                                                            ▄▛  
${reset}${white}${bold}
Universal Voice API - v1
${reset}${green}
🚀 Universal switching between voice AI providers without breaking conversations
🔄 Seamless provider switching: OpenAI ↔ Gemini ↔ and more  
🧠 Smart session persistence and conversation history preservation
⚡ Real-time WebSocket connections with HMAC authentication
📈 Performance monitoring and automatic failover switching
${reset}`);
  }

  static displayServerOnline(host: string, port: number, accountKeysCount: number): void {
    const { green, cyan, yellow, white, reset, bold } = this.colors;

    console.log(`${reset}${cyan}
🌐 Server listening on: ${bold}${white}http://${host}:${port}${reset}${cyan}
🔌 WebSocket endpoint: ${bold}${white}ws://${host}:${port}${reset}${cyan}  
${reset}`);
  }

  static displayServerError(port: number): void {
    const { red, reset, bold } = this.colors;

    console.log(`${red}${bold}
❌ FATAL ERROR: Failed to bind to port ${port}
${reset}`);
  }
}
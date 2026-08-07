import { useState } from 'react';
import {
  Monitor, Terminal, Apple, Copy, Check, Download, ShieldCheck,
  Settings, Package, KeyRound,
} from 'lucide-react';

interface CommandBlock {
  label: string;
  command: string;
}

const OS_COMMANDS: { id: string; name: string; icon: typeof Monitor; description: string; blocks: CommandBlock[] }[] = [
  {
    id: 'windows',
    name: 'Windows',
    icon: Monitor,
    description: 'Windows PowerShell (Run as Administrator)',
    blocks: [
      {
        label: 'Download and install the agent',
        command:
          'Set-ExecutionPolicy Bypass -Scope Process -Force\n' +
          'Invoke-WebRequest -Uri "https://backend-production-dd4e0.up.railway.app/api/v1/edr/agent/install.ps1" -OutFile "$env:TEMP\\argus-agent.ps1"\n' +
          '& "$env:TEMP\\argus-agent.ps1" -ServerUrl "https://backend-production-dd4e0.up.railway.app"',
      },
      {
        label: 'Register with your organization',
        command:
          '$org = Read-Host -Prompt "Organization API key"\n' +
          '& "$env:TEMP\\argus-agent.ps1" -ServerUrl "https://backend-production-dd4e0.up.railway.app" -OrgKey $org',
      },
      {
        label: 'Verify agent status',
        command:
          'Get-Service -Name "ArgusAgent" | Select-Object Status\n' +
          'sc query ArgusAgent',
      },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: Terminal,
    description: 'Bash terminal (Root or sudo user)',
    blocks: [
      {
        label: 'Download and install the agent',
        command:
          'curl -fsSL -o /tmp/argus-agent.sh "https://backend-production-dd4e0.up.railway.app/api/v1/edr/agent/install.sh"\n' +
          'chmod +x /tmp/argus-agent.sh\n' +
          'sudo bash /tmp/argus-agent.sh --server https://backend-production-dd4e0.up.railway.app',
      },
      {
        label: 'Register with your organization',
        command:
          'read -p "Organization API key: " ORG_KEY\n' +
          'sudo bash /tmp/argus-agent.sh --server https://backend-production-dd4e0.up.railway.app --org-key "$ORG_KEY"',
      },
      {
        label: 'Verify agent status',
        command:
          'sudo systemctl status argus-agent --no-pager\n' +
          'sudo systemctl restart argus-agent',
      },
    ],
  },
  {
    id: 'macos',
    name: 'macOS',
    icon: Apple,
    description: 'Terminal (zsh / bash)',
    blocks: [
      {
        label: 'Download and install the agent',
        command:
          'curl -fsSL -o /tmp/argus-agent.sh "https://backend-production-dd4e0.up.railway.app/api/v1/edr/agent/install.sh"\n' +
          'chmod +x /tmp/argus-agent.sh\n' +
          'sudo bash /tmp/argus-agent.sh --server https://backend-production-dd4e0.up.railway.app',
      },
      {
        label: 'Register with your organization',
        command:
          'read -p "Organization API key: " ORG_KEY\n' +
          'sudo bash /tmp/argus-agent.sh --server https://backend-production-dd4e0.up.railway.app --org-key "$ORG_KEY"',
      },
      {
        label: 'Verify agent status',
        command:
          'sudo launchctl list | grep argus\n' +
          'sudo launchctl stop com.argus.agent && sudo launchctl start com.argus.agent',
      },
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={copy}
      className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-lighter transition-colors"
      title="Copy command"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function CommandBlock({ block }: { block: CommandBlock }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">{block.label}</p>
      <div className="flex items-start gap-2 bg-surface border border-surface-border rounded-lg p-3">
        <pre className="flex-1 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all min-w-0">{block.command}</pre>
        <CopyButton text={block.command} />
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [activeOs, setActiveOs] = useState('windows');

  const active = OS_COMMANDS.find((os) => os.id === activeOs) ?? OS_COMMANDS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Agent Deployment</h1>
        <p className="text-gray-400 mt-1">Deploy the ARGUS agent to endpoints for telemetry collection</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-argus-600/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-argus-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-200">Prerequisites</h3>
              <p className="text-xs text-gray-500">Before deploying an agent</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <Package className="w-4 h-4 text-argus-400 mt-0.5 flex-shrink-0" />
              <span>An active <span className="text-gray-200">Endpoint/Asset record</span> exists for the target machine.</span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="w-4 h-4 text-argus-400 mt-0.5 flex-shrink-0" />
              <span>The machine can reach <span className="text-gray-200">backend-production-dd4e0.up.railway.app</span> on HTTPS (443).</span>
            </li>
            <li className="flex items-start gap-2">
              <Settings className="w-4 h-4 text-argus-400 mt-0.5 flex-shrink-0" />
              <span>Administrative (root / administrator) privileges are required to install the service.</span>
            </li>
          </ul>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-argus-600/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-argus-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-200">Install Scripts</h3>
              <p className="text-xs text-gray-500">Public endpoints for the installers</p>
            </div>
          </div>
          <div className="space-y-2">
            <a
              href="https://backend-production-dd4e0.up.railway.app/api/v1/edr/agent/install.ps1"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-surface-border hover:border-argus-500/50 transition-colors text-sm text-gray-300"
            >
              <Monitor className="w-4 h-4 text-gray-500" />
              <span className="font-mono text-xs">/api/v1/edr/agent/install.ps1</span>
            </a>
            <a
              href="https://backend-production-dd4e0.up.railway.app/api/v1/edr/agent/install.sh"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-surface-border hover:border-argus-500/50 transition-colors text-sm text-gray-300"
            >
              <Terminal className="w-4 h-4 text-gray-500" />
              <span className="font-mono text-xs">/api/v1/edr/agent/install.sh</span>
            </a>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {OS_COMMANDS.map((os) => {
            const OsIcon = os.icon;
            const isActive = os.id === activeOs;
            return (
              <button
                key={os.id}
                onClick={() => setActiveOs(os.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-argus-600/20 text-argus-400 border-argus-500/30'
                    : 'bg-surface text-gray-400 border-surface-border hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                <OsIcon className="w-4 h-4" />
                {os.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-argus-600/20 flex items-center justify-center">
            <ActiveIcon className="w-5 h-5 text-argus-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-200">{active.name} Agent</h3>
            <p className="text-xs text-gray-500">{active.description}</p>
          </div>
        </div>

        <div className="space-y-6">
          {active.blocks.map((block) => (
            <CommandBlock key={block.label} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}

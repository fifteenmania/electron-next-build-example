import { ExecaChildProcess, Options, execa } from "execa";
import { existsSync, fstat, fsync, rmdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererPort = 8080;

class WebpackManager {
  watching: webpack.Watching | null = null;
  mainProcessManager: MainProcessManager;
  constructor(mainProcessManager: MainProcessManager) {
    this.mainProcessManager = mainProcessManager;
  }

  checkPreviousBuild() {
    const filepath = path.join(process.cwd(), "app");
    return existsSync(filepath);
  }

  clearPreviousBuild() {
    // clear previous build
    if (this.checkPreviousBuild()) {
      rmdirSync(path.join(process.cwd(), "app"), { recursive: true });
    }
  }

  start() {
    this.clearPreviousBuild();
    const compiler = webpack({
      entry: "./main/background.ts",
      target: "electron-main",
      output: {
        path: path.join(process.cwd(), "app"),
        filename: "background.js",
      },
      mode: "development",
      plugins: [
        new webpack.EnvironmentPlugin({
          NODE_ENV: "development",
        }),
        new webpack.LoaderOptionsPlugin({
          debug: true,
        }),
      ],
      resolve: {
        fallback: {
          fs: false,
          path: false,
          util: false,
        },
      },
      devtool: "inline-source-map",
    });
    // on invalidation, terminate main process
    // on rebuild complete, restart main process
    const watching = compiler.watch({}, async (err, stats) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(stats.toString());
    });
    watching.compiler.hooks.emit.tap("EmitPlugin", () => {
      this.mainProcessManager.restart();
    });
    this.watching = watching;
  }

  // rebuild() {
  //   if (this.watching) {
  //     this.mainProcessManager.terminate();
  //     this.watching.invalidate(() => {
  //       this.mainProcessManager.start();
  //     });
  //   }
  // }

  terminate() {
    if (this.watching) {
      this.watching.close(() => {});
    }
    this.clearPreviousBuild();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class MainProcessManager {
  mainProcess: ExecaChildProcess | null = null;
  constructor() {}
  start() {
    const mainProcess = execa("electron", [".", `${rendererPort}`, '--remote-debugging-port=5858', '--inspect=9292'], {
      cwd: process.cwd(),
      stdio: "inherit",
      detached: true,
    });
    this.mainProcess = mainProcess;
    return mainProcess;
  }

  terminate(): Promise<void> {
    const mainProcess = this.mainProcess;
    return new Promise((resolve, reject) => {
      if (mainProcess && mainProcess.pid && !mainProcess.killed) {
        mainProcess.on("exit", () => {
          resolve();
        });
        mainProcess.kill();
      } else {
        resolve();
      }
    });
  }

  async restart() {
    await this.terminate()
    await sleep(1000)
    return this.start()
  }
}

class RendererManager {
  rendererProcess: ExecaChildProcess | null = null;
  constructor() {}

  start() {
    const rendererProcess = execa("next", ["-p", rendererPort.toString(), 'renderer'], execaOptions);
    this.rendererProcess = rendererProcess;
    return rendererProcess;  
  }

  terminate() {
    if (this.rendererProcess) {
      this.rendererProcess.kill();
    }
  }
}

const execaOptions: Options = {
  cwd: process.cwd(),
  stdio: "inherit",
};

const mainProcessManager = new MainProcessManager();
const webpackManager = new WebpackManager(mainProcessManager);
const rendererManager = new RendererManager();
webpackManager.start();
rendererManager.start();

process.on("SIGINT", () => {
  webpackManager.terminate();
  mainProcessManager.terminate();
  rendererManager.terminate();
  process.exit(0);
});
process.on("SIGTERM", () => {
  webpackManager.terminate();
  mainProcessManager.terminate();
  rendererManager.terminate();
  process.exit(0);
});

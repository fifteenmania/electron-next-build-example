import { ExecaChildProcess, Options, execa } from "execa";
import { rmdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebpackManager {
  watching: webpack.Watching | null = null;
  mainProcessManager: MainProcessManager;
  constructor(mainProcessManager: MainProcessManager) {
    this.mainProcessManager = mainProcessManager;
  }

  clearPreviousBuild() {
    // clear previous build
    rmdirSync(path.join(process.cwd(), "app"), { recursive: true });
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

class MainProcessManager {
  mainProcess: ExecaChildProcess | null = null;
  constructor() {}
  start() {
    const mainProcess = execa("electron", ["."], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    this.mainProcess = mainProcess;
    return mainProcess;
  }

  terminate(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.mainProcess) {
        this.mainProcess.on("exit", () => {
          resolve();
        });
        this.mainProcess.kill();
      } else {
        resolve();
      }
    });
  }

  async restart() {
    await this.terminate()
    return this.start()
  }
}

class RendererManager {

}

const execaOptions: Options = {
  cwd: process.cwd(),
  stdio: "inherit",
};

const mainProcessManager = new MainProcessManager();
const webpackManager = new WebpackManager(mainProcessManager);
webpackManager.start();

process.on("SIGINT", () => {
  webpackManager.terminate();
  mainProcessManager.terminate();
  process.exit(0);
});
process.on("SIGTERM", () => {
  webpackManager.terminate();
  mainProcessManager.terminate();
  process.exit(0);
});

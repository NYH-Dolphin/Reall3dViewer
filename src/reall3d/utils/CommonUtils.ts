// ================================
// Copyright (c) 2025 reall3d.com
// ================================
import { Events } from '../events/Events';
import {
    Vector3ToString,
    IsFetching,
    RunLoopByFrame,
    RunLoopByTime,
    GetOptions,
    GetMaxRenderCount,
    OnFetchStop,
    OnFetchStart,
    Information,
    IsDebugMode,
    IsSmallSceneRenderDataReady,
    OnTextureReadySplatCount,
    OnFetching,
    IsBigSceneMode,
    EncodeBase64,
    DecodeBase64,
    GetCanvasSize,
    GetCanvas,
    TraverseDisposeAndClear,
    IsCameraChangedNeedLoadData,
    GetCamera,
    CommonUtilsDispose,
    GetSplatDataSize,
} from '../events/EventConstants';
import { Object3D, PerspectiveCamera, ShaderChunk, Vector3 } from 'three';
import { SplatMeshOptions } from '../meshs/splatmesh/SplatMeshOptions';
import { SplatDataSize36, Bin2DataSize, isMobile, ViewerVersion } from './consts/GlobalConstants';

export function setupCommonUtils(events: Events) {
    let disposed: boolean = false;
    const on = (key: number, fn?: Function, multiFn?: boolean): Function | Function[] => events.on(key, fn, multiFn);
    const fire = (key: number, ...args: any): any => events.fire(key, ...args);

    on(IsDebugMode, () => fire(GetOptions).debugMode);

    on(CommonUtilsDispose, () => (disposed = true));

    on(GetMaxRenderCount, (): number => {
        const opts: SplatMeshOptions = fire(GetOptions);
        return isMobile ? opts.maxRenderCountOfMobile : opts.maxRenderCountOfPc;
    });

    // 按帧率执行
    let iFrameCount: number = 0;
    (function countFrame() {
        iFrameCount++;
        !disposed && requestAnimationFrame(countFrame);
    })();

    on(RunLoopByFrame, (fnRun: Function, fnIsContinue: Function = null, div: number = 0) => {
        const run = () => {
            if (!disposed) {
                div > 0 ? !(iFrameCount % div) && fnRun(iFrameCount) : fnRun(iFrameCount);
                fnIsContinue && fnIsContinue() && requestAnimationFrame(run);
            }
        };
        run();
    });

    // 默认按每秒50次执行
    on(RunLoopByTime, (fnRun: Function, fnIsContinue: Function = null, delay: number = 20) => {
        const run = () => {
            if (!disposed) {
                fnRun();
                fnIsContinue && fnIsContinue() && setTimeout(run, delay);
            }
        };
        run();
    });

    let loading = false;
    let renderSplatCount: number = 0;
    let textureReadySplatCount: number = 0;
    on(OnFetchStart, () => {
        loading = true;

        if (fire(GetOptions).debugMode) {
            (async () => {
                const wrap: HTMLElement = document.querySelector('#gsviewer #progressBarWrap');
                if (wrap) {
                    wrap.style.display = fire(IsBigSceneMode) ? 'none' : 'block';
                    const dom: HTMLElement = document.querySelector('#gsviewer #progressBar');
                    dom && (dom.style.width = `0%`);
                }
            })();
            (async () => document.querySelector('#gsviewer .logo')?.classList.add('loading'))();
        } else {
            // @ts-ignore
            parent?.onProgress && parent.onProgress(0.001, '0.001%');
        }
    });
    on(OnFetchStop, (totalRenderSplatCount: number) => {
        totalRenderSplatCount && (renderSplatCount = totalRenderSplatCount);
        loading = false;

        if (totalRenderSplatCount !== undefined) {
            (async () => {
                const wrap: HTMLElement = document.querySelector('#gsviewer #progressBarWrap');
                wrap && (wrap.style.display = 'none');
            })();
            (async () => document.querySelector('#gsviewer .logo')?.classList.remove('loading'))();

            // @ts-ignore
            totalRenderSplatCount !== undefined && parent?.onProgress && parent.onProgress(0, '100%', 9); // 用自定义的 9 代表完全加载完成
        }
    });
    on(OnFetching, (per: number) => {
        loading = true;

        if (fire(GetOptions).debugMode) {
            !fire(IsBigSceneMode) &&
                (async () => {
                    const dom: HTMLElement = document.querySelector('#gsviewer #progressBar');
                    dom && (dom.style.width = `${per}%`);
                })();
        } else {
            // @ts-ignore
            parent?.onProgress && parent.onProgress(per, `${per}%`);
        }
    });
    on(IsFetching, () => loading);
    on(OnTextureReadySplatCount, (renderCount: number) => {
        textureReadySplatCount = renderCount;
    });
    on(IsSmallSceneRenderDataReady, () => {
        return !loading && renderSplatCount && textureReadySplatCount >= renderSplatCount;
    });

    on(GetCanvasSize, () => {
        const canvas: HTMLCanvasElement = fire(GetCanvas);
        const rect = canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    });

    on(Vector3ToString, (v: Vector3): string => {
        let x = v.x.toFixed(3).split('.');
        let y = v.y.toFixed(3).split('.');
        let z = v.z.toFixed(3).split('.');
        if (x[1] === '000' || x[1] === '00000') x[1] = '0';
        if (y[1] === '000' || y[1] === '00000') y[1] = '0';
        if (z[1] === '000' || z[1] === '00000') z[1] = '0';
        return `${x.join('.')}, ${y.join('.')}, ${z.join('.')}`;
    });

    on(EncodeBase64, (str: string): string => btoa(str));
    on(DecodeBase64, (str: string): string => atob(str));

    on(GetSplatDataSize, (binVer: number) => (binVer === 2 ? Bin2DataSize : SplatDataSize36));

    const epsilon = 0.001;
    let lastLoadDataPosition: Vector3 = new Vector3();
    let lastLoadDataDirection2: Vector3 = new Vector3();
    let lastLoadDataFov: number = 0;
    on(IsCameraChangedNeedLoadData, () => {
        const camera: PerspectiveCamera = fire(GetCamera);
        const fov = camera.fov;
        const position = camera.position.clone();
        const direction = camera.getWorldDirection(new Vector3());
        if (
            Math.abs(lastLoadDataFov - fov) < epsilon &&
            Math.abs(position.x - lastLoadDataPosition.x) < epsilon &&
            Math.abs(position.y - lastLoadDataPosition.y) < epsilon &&
            Math.abs(position.z - lastLoadDataPosition.z) < epsilon &&
            Math.abs(direction.x - lastLoadDataDirection2.x) < epsilon &&
            Math.abs(direction.y - lastLoadDataDirection2.y) < epsilon &&
            Math.abs(direction.z - lastLoadDataDirection2.z) < epsilon
        ) {
            return false;
        }

        lastLoadDataFov = fov;
        lastLoadDataPosition = position;
        lastLoadDataDirection2 = direction;

        return true;
    });

    on(TraverseDisposeAndClear, (obj3d: Object3D) => {
        if (!obj3d) return;

        const objects: any[] = [];
        obj3d.traverse((object: any) => objects.push(object));
        objects.forEach((object: any) => {
            if (object.dispose) {
                object.dispose();
            } else {
                object.geometry?.dispose?.();
                object.material && object.material instanceof Array
                    ? object.material.forEach((material: any) => material?.dispose?.())
                    : object.material?.dispose?.();
            }
        });
        obj3d.clear();
    });

    on(
        Information,
        async ({
            renderSplatCount,
            visibleSplatCount,
            modelSplatCount,
            models,
            renderModels,
            fps,
            realFps,
            sortTime,
            fov,
            position,
            lookUp,
            lookAt,
            worker,
            scene,
            updateSceneData,
            scale,
        }: Partial<Record<string, any>> = {}) => {
            if (!fire(IsDebugMode)) return;

            renderSplatCount !== undefined && setInfo('renderSplatCount', `${renderSplatCount}`);
            visibleSplatCount !== undefined && setInfo('visibleSplatCount', `${visibleSplatCount}`);
            modelSplatCount !== undefined && setInfo('modelSplatCount', `${modelSplatCount}`);
            models && setInfo('models', models);
            renderModels !== undefined && setInfo('renderModels', renderModels);
            fps !== undefined && setInfo('fps', fps);
            realFps !== undefined && setInfo('realFps', `raw ${realFps}`);
            sortTime !== undefined && setInfo('sort', `(${formatDate(new Date(), 1)})　${sortTime} ms`);
            worker && setInfo('worker', `${worker}`);
            updateSceneData && setInfo('updateSceneData', `（up ${updateSceneData} ms）`);
            scene && setInfo('scene', scene);
            fov && setInfo('fov', fov);
            position && setInfo('position', position);
            lookUp && setInfo('lookUp', lookUp);
            lookAt && setInfo('lookAt', lookAt);
            lookAt && setInfo('viewer-version', ViewerVersion);

            // @ts-ignore
            let memory = performance.memory || { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 };
            let strMemory = '';
            let usedJSHeapSize = memory.usedJSHeapSize / 1024 / 1024;
            usedJSHeapSize > 1000 ? (strMemory += (usedJSHeapSize / 1024).toFixed(2) + ' G') : (strMemory += usedJSHeapSize.toFixed(0) + ' M');
            strMemory += ' / ';
            let totalJSHeapSize = memory.totalJSHeapSize / 1024 / 1024;
            totalJSHeapSize > 1000 ? (strMemory += (totalJSHeapSize / 1024).toFixed(2) + ' G') : (strMemory += totalJSHeapSize.toFixed(0) + ' M');
            let jsHeapSizeLimit = memory.jsHeapSizeLimit / 1024 / 1024;
            strMemory += ' / ';
            jsHeapSizeLimit > 1000 ? (strMemory += (jsHeapSizeLimit / 1024).toFixed(2) + ' G') : (strMemory += jsHeapSizeLimit.toFixed(0) + ' M');
            setInfo('memory', strMemory);

            scale && setInfo('scale', scale);
        },
    );
    async function setInfo(name: string, txt: any) {
        let dom: HTMLDivElement = document.querySelector(`#gsviewer .debug .${name}`);
        dom && (dom.innerText = txt);
    }
    function formatDate(now: Date = new Date(), formatType: number = 1) {
        const year = now.getFullYear();
        const month = (100 + now.getMonth() + 1 + '').substring(1);
        const day = (100 + now.getDate() + '').substring(1);
        const hours = (100 + now.getHours() + '').substring(1);
        const minutes = (100 + now.getMinutes() + '').substring(1);
        const seconds = (100 + now.getSeconds() + '').substring(1);
        const milliseconds = (1000 + now.getMilliseconds() + '').substring(1);
        if (formatType === 1) {
            return `${hours}:${minutes}:${seconds}.${milliseconds}`;
        } else if (formatType === 2) {
            return `${seconds}.${milliseconds}`;
        }
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
    }
}

export const shaderChunk = ShaderChunk;

export function initSplatMeshOptions(options: SplatMeshOptions): SplatMeshOptions {
    const opts: SplatMeshOptions = { ...options };

    // 默认参数校验设定
    opts.pointcloudMode ??= !opts.bigSceneMode; // 小场景默认点云模式，大场景默认正常模式
    opts.lightFactor ??= 1.0;
    opts.maxRenderCountOfMobile ??= opts.bigSceneMode ? 64 * 2 * 10240 : 98 * 2 * 10240;
    opts.maxRenderCountOfPc ??= opts.bigSceneMode ? 256 * 10240 : 256 * 2 * 10240;
    opts.maxFetchCount = opts.maxFetchCount ? (opts.maxFetchCount >= 1 && opts.maxFetchCount <= 32 ? opts.maxFetchCount : 16) : 16;
    opts.debugMode ??= location.protocol === 'http:' || /^test\./.test(location.host); // 生产环境不开启

    return opts;
}

export const decodeB64 = atob;

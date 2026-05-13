# 尝试vite+react+qiankun
## 一、准备
1. 直接通过脚手架新建vite+react项目react-test，启动很正常
2. react-test作为主应用，安装qiankun，运行正常
3. 再新建一个项目react-test-sub，作为微应用，安装vite-plugin-qiankun配置
    ```
    // vite.config.ts
    import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'
    import qiankun from 'vite-plugin-qiankun' // ← 必须引入这个插件！，这里配置就可以，不用在main.ts导出生命周期

    export default defineConfig({
      plugins: [
        react(),
        qiankun('react-test-sub', { // ← 子应用名称必须与主应用注册一致
          useDevMode: true
        })
      ],
      build: {
        cssMinify: false,	// 脚手架直接创建的项目，打包时有个css相关的报错
      },
      server: {
        host: '0.0.0.0', 	// 监听所有网络接口
        port: 3000, 		// 设置微应用端口
        allowedHosts: true, // 支持跨域，主应用访问微应用文件会触发跨域
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    })
    ```

4. 主应用微应用都是开发模式，主应用可以正常加载微应用
    ```
    //main.tsx
    import { StrictMode } from 'react'
    import { createRoot } from 'react-dom/client'
    import { registerMicroApps, start } from 'qiankun';
    import './index.css'
    import App from './App.tsx'

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ) 
    registerMicroApps([
      {
        name: 'react-test-sub',
        entry: 'http://localhost:3000/',
        container: '#tihuan',
        activeRule: '/user/manage.html'
      },
    ]);

    start();

    // 启动后主应用http://localhost:5173/user/manage.html 加载微应用
    ```


5. 打包微应用后，nginx配置
    ```
    http {
      ...
      server {
        listen       8083;
        
        server_name  localhost;
        
        # 子应用实际文件
        location /react-test-sub/ {
          alias C:/Users/xieshaoxi/Desktop/work/react-test-sub/dist/;
          try_files $uri $uri/ /react-test-sub/index.html;
          
          # 允许跨域配置
          add_header 'Access-Control-Allow-Origin' '*' always;
          add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
          add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;

          # 处理预检请求（OPTIONS）
          if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With';
            add_header 'Access-Control-Max-Age' 86400; # 缓存预检请求结果24小时
            return 204; # 不返回内容，仅状态码
          }
          
        }
        
        location / {
          root C:/Users/xxx/react-test-sub/dist;
                index  index.html index.htm;
          
          # 允许跨域配置
          add_header 'Access-Control-Allow-Origin' '*' always;
          add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
          add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;

          if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With';
            add_header 'Access-Control-Max-Age' 86400; # 缓存预检请求结果24小时
            return 204; # 不返回内容，仅状态码
          }
        }
        
        
        
        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
          root   html;
        }
      }
    }

    // 直接打开localhost:8083能正常访问
    ```

## 二、主应用加载微应用问题
### 问题1：报错js文件404

1. 现象：使用vite-plugin-qiankun插件后，打包的js文件是通过import引入的，再在主应用加载的时候，会通过主应用的域名去请求，就变成了localhost:5173/xxx.js，正常应该是localhost:8083/xxx.js

2. 过程：后面就在使用vite-plugin-qiankun插件的基础上疯狂找ai修改，想修改打包配置，让js文件能正常加载，但一直失败，ai一直说要在打包的时候写死域名，但是这样后续不方便配置，而且我也看过不写死域名的，也能正常加载微应用
后来突然看到css文件能正常加载，走的是微应用的域名，才发现是js文件的引入方式不对，遂找ai对峙，才知道是vite-plugin-qiankun插件的原因，这个插件会帮你处理qiankun生命周期和vite的东西，然后需要用import引入js

3. 解决：知道原因就好处理了，把vite-plugin-qiankun先注释掉，然后再配置build开始打包，同时还有在main.ts导出生命周期，打包后，查看index.html文件，发现打包后的js文件通过<script type="module" crossorigin src="/assets/index-DrMXR-mN.js"></script>引用

4. 修改后配置：
    ```
    // vite.config.ts
    import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'


    export default defineConfig({
      plugins: [react()],
      build: {
        target: 'es2015',
        modulePreload: false,
        cssMinify: false,
        cssCodeSplit: false,
      },
      server: {
        host: '0.0.0.0', // 监听所有网络接口
        port: 3000,
        allowedHosts: true,
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    })
    ```

5. 结果：直接访问localhost:8083是可以正常访问的，但是主应用加载微应用还是报错，提示生命周期没有

### 问题2：生命周期导出问题
1. 原因：去掉vite-plugin-qiankun插件后，生命周期需要手动导出

2. 解决：
    1. 在main.tsx文件中导出生命周期，然后在微应用的vite.config.ts上试了几种配置，打包后的文件一直是没有生命周期的（在js文件里面，搜bootstrap）
        ```
        // main.tsx
        import React from 'react'
        import ReactDOM from 'react-dom/client'
        import App from './App'

        let root: ReactDOM.Root | null = null

        function render(props: any = {}) {
          const { container } = props
          const dom = container 
            ? container.querySelector('#root')
            : document.getElementById('root')
          
          root = ReactDOM.createRoot(dom!)
          root.render(
            <React.StrictMode>
              <App />
            </React.StrictMode>
          )
        }
        export async function bootstrap() {
          console.log('[子应用] bootstrap')
        }

        export async function mount(props: any) {
          console.log('[子应用] mount', props)
          render(props)
        }

        export async function unmount() {
          console.log('[子应用] unmount')
          root?.unmount()
          root = null
        }
      ```
    2. 换了个ai询问，说是vite不会在main.ts上导出，需要手动导出，再挂载到window下
      ```
        // main.ts
        window.reactTestSub = {
          'react-test-sub': {
            bootstrap: async () => {
              console.log('[子应用] bootstrap')
            },
            mount: async (props: any) => {
              console.log('[子应用] mount', props)
              render(props)
            },
            unmount: async () => {
              console.log('[子应用] unmount')
              root?.unmount()
              root = null
            }
          }
        }
        // index.html
        <script type="module" src="/src/main.tsx"></script>
        <!-- 手动挂载生命周期 -->
        <script>
        // 等待主脚本加载完成后执行
        window.addEventListener('load', function() {
          // 如果主脚本导出了生命周期，这里手动挂载到 window
          if (window.reactTestSub) {
          window.__POWERED_BY_QIANKUN__ = true;
          window.reactTestSub.bootstrap = window.reactTestSub.bootstrap || function() {};
          window.reactTestSub.mount = window.reactTestSub.mount || function() {};
          window.reactTestSub.unmount = window.reactTestSub.unmount || function() {};
          }
        })
        </script>
      ```
3. 结果：尝试之后终于能在主应用加载打包后的微应用，但是图片这些静态文件加载还是走的主应用的域名，除了这个，是能正常加载的

### 问题3：vite打包后的静态文件问题
1. 现象：主应用加载微应用时，静态文件一直加载出错，域名使用的主应用的域名
2. 过程：问半天ai，包括看qinakun的官网，一直说是要注意__webpack_public_path__ = window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__;
但是main.ts最上面引用还是没有效果
后续尝试了，包括vite.config里面配置静态文件输出地址、base改为相对路径，在导出的生命周期里面给__webpack_public_path__赋值，但是都没效果，走的域名还是主应用的域名
最后问了ai“怎么看__webpack_public_path__是否生效”，这个时候说这个变量在vite下不会自动生效，然后给了一个方案是index.html里面手动设置base.url(因为在微应用的配置文件里面，base改为相对地址后，静态资源的引用是动态拼接的，new URL(`hero-CLDdwZDr.png`,document.currentScript && document.currentScript.tagName.toUpperCase() === `SCRIPT` && document.currentScript.src || document.baseURI).href)
3. 配置
    ```
    // index.html
    ...
    <head>
      ...
      <title>xxx</title>
        <script>
          // 动态设置 base href
          (function() {
            var base = document.createElement('base');
            base.href = window.__POWERED_BY_QIANKUN__ ? window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ : './';
            document.head.appendChild(base);
          })();
        </script>
    </head>
    ```
    设置完就可以了

    还有一个方案是在微应用导出的生命周期mount里面赋值
    ```
    // main.ts
    mount(props: any) {
      let baseElement = document.querySelector('base');
      
      if (!baseElement) {
        baseElement = document.createElement('base');
        document.head.prepend(baseElement);
      }
      
      if ((window as any).__POWERED_BY_QIANKUN__) {
        baseElement.href = (window as any).__INJECTED_PUBLIC_PATH_BY_QIANKUN__;
      } else {
        baseElement.href = import.meta.env.BASE_URL;
      }
      // render方法
    }
    ```
## 三、目前配置
### 主应用
```
// main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerMicroApps, start } from 'qiankun';
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


registerMicroApps([
  {
    name: 'react-test-sub',
    entry: 'http://localhost:8083/index.html',
    container: '#tihuan',
    activeRule: '/console/home.html'
  },
]);

start();
```
```
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 监听所有网络接口
    port: 5173,
    allowedHosts: true
  },
  build: {
    minify: false,
    cssMinify: false
  }
})
```
### 子应用
```
// index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>react-test</title>
    <script>
      // 动态设置 base href
      (function() {
        var base = document.createElement('base');
        base.href = window.__POWERED_BY_QIANKUN__ ? window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ : './';
        document.head.appendChild(base);
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
```
// main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// 在样式入口文件中
if (!(window as any).__POWERED_BY_QIANKUN__) {
  // 独立运行时引入全局样式
  import('./global-styles.css');
}

let root: ReactDOM.Root | null = null;
declare const __APP_NAME__: string
function render(props: any = {}) {
  const { container } = props
  const dom = container ? container.querySelector('#root') : document.getElementById('root');  
  root = ReactDOM.createRoot(dom!)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

// 独立运行时直接渲染
if (!(window as any).__POWERED_BY_QIANKUN__) {
  render()
}

Object.assign((window as any), {
  [__APP_NAME__]: {
    bootstrap: async () => {
      console.log(`[子应用${__APP_NAME__}] bootstrap`);
    },
    mount: async (props: any) => {
      console.log(`[子应用${__APP_NAME__}] mount`, props);
      render(props)
    },
    unmount: async () => {
      console.log(`[子应用${__APP_NAME__}] unmount`);
      root?.unmount()
      root = null
    }
  }
})
```
```
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import qiankun from 'vite-plugin-qiankun' // ← 必须引入这个插件！
import pkg from './package.json' with { type: 'json' }

const isDev = process.env.NODE_ENV == 'development';

export default defineConfig({
  plugins: [
    react(),
    isDev ? qiankun(pkg.name, { useDevMode: true }) : undefined,
  ],
  build: {
    cssMinify: false,
    rollupOptions: {
      external: [
        // 排除已知的主应用样式文件
        /global-styles\.css$/,
      ]
    }
  },
  server: {
    host: '0.0.0.0', // 监听所有网络接口
    port: 3000,
    allowedHosts: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  css: {
    modules: {
      // 生成局部样式类名
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
  },
})

```
## 四、补充
1. 针对公共样式的调整
    ```
    // main.tsx
    if (!(window as any).__POWERED_BY_QIANKUN__) {
      // 独立运行时引入全局样式
      import('./global-styles.css');
    }
    // vite.config.ts
    export default defineConfig({
        ...
        build: {
        ...
          rollupOptions: {
            external: [
              // 排除已知的主应用样式文件
              /global-styles\.css$/,
            ]
          }
        },
    })
    ```







## 五、随笔


1. 小程序注意：
  小程序限制
  webview页面需要配置为业务域名才能跳转（在服务器下放置检验文件）
  判断是否是微信小程序环境不一定准确
  播放视频，需要用户点击后操作，不能自动播放（可以点击后通过play播放）
  vat-button在ios中设置跳转客服无效，需要删除businessId（未检验）
  
  uniapp 小程序，组件的组件使用插件时，因json无法配置，需要全局配置插件，但是打包为分包（为主包不确定）时，全局配置无效
  把插件提到页面组件中，并在pages.json中该页面组件的配置，配置好插件参数







2. uniapp 小程序 获取元素宽高，使用createSelectorQuery时，对应元素的id或者class不能使用:id="a + b"的形式定义，至少需要:id="'xx' + a"的形式定义，即字符串+变量，或者直接用字符串，不然获取不到元素

uni.request 的参数名是 header 而不是 headers



搭建官网：ai官网
大文件下载
canvas多边形
fabric

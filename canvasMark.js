
import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Canvas, Rect } from "fabric";
import * as fabric from "fabric";

const canvasId = "mobile_help_feedback_canvas";

// export const CommandAddModal = forwardRef<CustomCommandModalMethods, CustomCommandModalProps>((props, ref) => {
export const CanvasMark = forwardRef((props, ref) => {

  const {
    isAddRect=false, isAddText=false, afterAddRect=()=>{}, afterAddText=()=>{}, afterSelect=() => {}, afterDblckick = () => {},
    width, initHeight, backgroundImage, maxRectNum
  } = props;

  const canvasRef = useRef();
  // 记录点击时，是否有有效操作（选中、取消选中、拖拽、拉伸）
  const isOpera = useRef(false);


  useImperativeHandle(ref, () => ({
    // 删除选中的元素
    deleteSelected: () => {
      if (canvasRef.current === undefined) return false;
      let canvas: Canvas = canvasRef.current;

      let activeObject = canvas.getActiveObjects()?.[0];
      if(!activeObject) return false;

      try {
        canvas.remove(activeObject);
        canvas.renderAll();
        canvas.discardActiveObject();
        return true;
      } catch (error) {
        return false;
      }
    },
    // 取消选中的元素
    clearSelect: () => {
      if (canvasRef.current === undefined) return;
      let canvas: Canvas = canvasRef.current;
      canvas.discardActiveObject();
      canvas.renderAll();
    },
    getCanvas: () => canvasRef.current,
    // canvas转为图片
    getCanvasImage: async () => {
      try {
        if (canvasRef.current === undefined) return;
        let canvas: Canvas = canvasRef.current;
        let data = await canvas.toDataURL({
          format: "jpeg",
          quality: 1,
          multiplier: 2,
        });
        return data;
      } catch (error) {
        console.log(error);
        return "";
      }
    }
  }), [canvasRef]);


  // 初始化canvas对象
  useEffect(() => {
    let canvas = new fabric.Canvas(canvasId, { allowTouchScrolling: true });
    canvasRef.current = canvas;

    return () => {
      canvas.dispose();
    }
  }, [canvasRef])

  // useEffect(() => {
  //   if (canvasRef.current === undefined) return;
  //   let canvas: Canvas = canvasRef.current;

  //   let timer;
  //   // 监听选择事件，确保任何时候只有一个对象被选中
  //   let operaCallback = (e: any) => {
  //   }

  //   // 监听选中、取消选中事件
  //   canvas.on('selection:created', operaCallback);
  //   canvas.on('selection:updated', operaCallback);
  //   canvas.on('object:scaling', operaCallback);
  //   canvas.on('mouse:move', operaCallback);
  //   canvas.on('mouse:click', operaCallback);

  //   return () => {
  //     canvas.off('selection:created', operaCallback);
  //     canvas.off('selection:updated', operaCallback);
  //     canvas.off('object:scaling', operaCallback);
  //     canvas.off('mouse:move', operaCallback);
  //   };
  // }, [canvasRef, isOpera])

  // 双击回调
  useEffect(() => {
    if (canvasRef.current === undefined) return;
    let canvas: Canvas = canvasRef.current;
    // 监听选择事件，确保任何时候只有一个对象被选中
    let operaCallback = (e: any) => {
      console.log('双击回调afterDblckick', afterDblckick)
      afterDblckick && afterDblckick();
    }

    // 监听选中、取消选中事件
    canvas.on('mouse:dblclick', operaCallback);

    return () => {
      canvas.off('mouse:dblclick', operaCallback);
    };
  }, [canvasRef, afterDblckick])


  // 绘制背景图片，并根据图片调整canvas宽高
  useEffect(() => {
    if (canvasRef.current === undefined || !backgroundImage) return;
    let canvas: Canvas = canvasRef.current;

    // 加载图片
    fabric.Image.fromURL(backgroundImage).then((img:any) => {

      let scale = width / img.width;
      canvas.width = width;
      canvas.height = img.height * scale;
      console.log(width, canvas.height, img.width, img.height);
      
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top'
      });
      
      // 直接设置 backgroundImage 属性
      canvas.backgroundImage = img;
      canvas.setDimensions({ width, height: img.height * scale  })
      canvas.renderAll();

    });

  }, [canvasRef, backgroundImage, width])

  // 绘制时，不能选中原有的元素
  useEffect(() => {
    if (canvasRef.current === undefined) return;
    let canvas: Canvas = canvasRef.current;

    canvas.allowTouchScrolling = !(isAddRect || isAddText);

    let selectable = !(isAddRect || isAddText);
    canvas.getObjects().forEach((item) => {
      item.selectable = selectable;
    });

    canvas.renderAll();
  }, [canvasRef, isAddRect, isAddText])

  // 绘制矩形相关
  const drawRect = useCallback(() => {
    if (canvasRef.current === undefined || (!isAddRect && !isAddText)) return () => {};
    let canvas: Canvas = canvasRef.current;

    if(maxRectNum && canvas.getObjects('rect').length >= maxRectNum) {
      afterAddRect("最多支持3个划框");
      return;
    }

    let rect: any, startX: number, startY: number;

    // 鼠标按下事件监听回调
    let mouseDownCallback = (options: any) => { 
      if (!isAddRect) return;

      startX = options.scenePoint.x;
      startY = options.scenePoint.y;

      // 创建矩形
      rect = new Rect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
      });
      setupCornerControls(rect);
      canvas.add(rect);
    };

    // 鼠标/触摸移动事件
    let mouseMoveCallback = (options: any) => {
      if (!isAddRect || !rect) return;

      const pointer = options.scenePoint;
      let width = Math.abs(startX - pointer.x);
      let height = Math.abs(startY - pointer.y);
      let left = (startX > pointer.x ? pointer.x : startX);
      let top = (startY > pointer.y ? pointer.y : startY);

      rect.set({ left, top, width, height });
      canvas.renderAll();
    };

    // 鼠标/触摸释放事件
    let mouseUpCallback = (options: any) => {
      if (isAddRect && rect) {
        // 如果矩形太小，则删除
        if (rect.width < 5 || rect.height < 5) {
          canvas?.remove(rect);
        } else {
          // 设置矩形为可选择状态
          rect.set({ selectable: true });
        }
        afterAddRect(rect)
        // 重置绘制状态
        rect = null;
      }else if (isAddText) {
        const pointer = options.scenePoint;
        let text = new fabric.Textbox("", {
          left: pointer.x,
          top: pointer.y,
        });
        setupCornerControls(text, false);
        
        canvas.add(text);
        // 默认选中
        canvas.setActiveObject(text);
        afterAddText(text);
      }
    };

    // 绑定事件
    canvas.on('mouse:down', mouseDownCallback);
    canvas.on('mouse:move', mouseMoveCallback);
    canvas.on('mouse:up', mouseUpCallback);

    return () => {
      // 解绑事件
      canvas.off('mouse:down', mouseDownCallback);
      canvas.off('mouse:move', mouseMoveCallback);
      canvas.off('mouse:up', mouseUpCallback);
    };

  }, [canvasRef, isAddRect, isAddText, afterAddRect, afterAddText]);

  // 绑定绘制矩形
  useEffect(drawRect, [drawRect]);

  // 一次只能选中一个节点
  const selectRect = useCallback(() => {
    if (canvasRef.current === undefined) return;
    let canvas: Canvas = canvasRef.current;

    // 监听选择事件，确保任何时候只有一个对象被选中
    let selectionCallback = (e: any) => {
      // console.log("afterSelect");
      if (e.selected && e.selected.length > 1) {
        // 如果多选了，只保留最后一个选中的对象
        const lastSelected = e.selected[e.selected.length - 1];
        canvas.discardActiveObject();
        canvas.setActiveObject(lastSelected);
      }
      afterSelect(e?.selected);
    }

    // 监听选择事件，确保任何时候只有一个对象被选中
    canvas.on('selection:created', selectionCallback);
    canvas.on('selection:updated', selectionCallback);
    canvas.on('selection:cleared', selectionCallback);

    return () => {
      canvas.off('selection:created', selectionCallback);
      canvas.off('selection:updated', selectionCallback);
      canvas.off('selection:cleared', selectionCallback);
    };
  }, [canvasRef, afterSelect]);
  useEffect(selectRect, [selectRect]);

  // 拉伸缩小
  const scaleRect = useCallback(() => {
    if (canvasRef.current === undefined) return;
    let canvas: Canvas = canvasRef.current;

    // 缩放事件处理
    let scaleAnimationId: any = null;
    let initLW: number = -1, initTH: number = -1;
    let initL: number = -1, initT: number = -1;


    let objectScalingCallback = (e: any) => { 
      if (scaleAnimationId) {
        cancelAnimationFrame(scaleAnimationId);
      }
      e.e.preventDefault();

      scaleAnimationId = requestAnimationFrame(() => {
        const target = e.target;
        let pointer = e.pointer;
        target.objectCaching = false;

        const corner = e.transform.corner;

        let { width, height, left, top } = target;
        let padding = 4;
        // 防止越界
        if(pointer.x <= 0) pointer.x = 0;
        if(pointer.y <= 0) pointer.y = 0;
        if(pointer.x >= canvas.width - padding) pointer.x = canvas.width - padding;
        if(pointer.y >= canvas.height - padding) pointer.y = canvas.height - padding;
        // console.log(canvas.width, canvas.height, pointer)

        let minWidth = 50, minHeight = 50;
        // 左上角
        if (corner === 'tl') {
          left = Math.min(pointer.x, initLW - minWidth);
          width = initLW - left;
          top = Math.min(pointer.y, initTH - minHeight);
          height = initTH - top;

          // 右上角
        } else if (corner === 'tr') {
          left = initL;
          width = Math.max(pointer.x - left, minWidth);
          top = Math.min(pointer.y, initTH - minHeight);
          height = initTH - top;

          // 左下角
        } else if (corner === 'bl') {
          left = Math.min(pointer.x, initLW - minWidth);
          width = initLW - left;
          top = initT;
          height = Math.max(pointer.y - top, minHeight);

          // 右下角
        } else if (corner === 'br') {
          left = initL;
          width = Math.max(pointer.x - left, minWidth);
          top = initT;
          height = Math.max(pointer.y - top, minHeight);
        }
        // console.log(`canvas.width: ${canvas.width}, canvas.height: ${canvas.height}, width: ${width}, height: ${height}, left: ${left}, top: ${top}`)
        target.set({ width, height, left, top, scaleX: 1, scaleY: 1 });


        setTimeout(() => { target.objectCaching = true; }, 10);
        // 智能刷新
        target.setCoords();
        canvas.renderAll(); // 使用renderAll而不是requestRenderAll以获得更精确的控制
      });
    };

    // 鼠标/触摸释放时，清除缩放动画
    let mouseUpCallback = () => {
      if (scaleAnimationId) {
        cancelAnimationFrame(scaleAnimationId);
        scaleAnimationId = null;
      }
    }

    // 鼠标/触摸时，重置数据
    let mouseDownCallback = () => {
      // 记录初始的数据，防止缩放时出现偏移
      let obj = canvas.getActiveObject();
      if (obj) {
        initLW = obj.width + obj.left;
        initTH = obj.height + obj.top;
        initL = obj.left;
        initT = obj.top;
      }
    }

    canvas.on('object:scaling', objectScalingCallback);
    canvas.on('mouse:up', mouseUpCallback);
    canvas.on('mouse:down', mouseDownCallback);

  }, [])
  useEffect(scaleRect, [scaleRect]);


  return <div className="feedback" style={{ margin: 0 }}>
    <canvas id={canvasId} width={width} height={initHeight || width}></canvas>
  </div>;
});



// 自定义控制点样式函数，和矩形文字区域的基础配置
function setupCornerControls(obj: Rect | fabric.Textbox, isRect: boolean=true) {
  let options = isRect ? {
    fill: '#faad141a',
    stroke: '#FAAD14',
    strokeWidth: 4,

    // 隐藏边框
    hasBorders: false,
  } : {
    width: 237,
    height: 51,

    borderWidth: 2,
    borderDashArray: [5, 5],
    borderDashOffset: 0,
    borderColor: '#FAAD14',
    editingBorderColor: '#FAAD14',
    
    padding: 14,
    // stroke: "rgba(255, 77, 79, 1)",
    fill: "rgba(255, 77, 79, 1)",
    fontWeight: 400,
    fontSize: 16,
    letterSpacing:1,
    lineHeight: 1.5,
    splitByGrapheme: true, // 拆分中文，可以实现自动换行
  };
  // 设置控制点样式 - 白色背景，黑色边框
  obj.set({
    // 基本控制点设置
    cornerColor: '#ffffff',           // 白色背景
    cornerSize: 8,                   // 控制点大小
    cornerStrokeColor: '#000000',     // 黑色边框
    cornerStrokeWidth: 20,             // 边框宽度
    transparentCorners: false,        // 不透明
    borderScaleFactor: 2, // 边框厚度比例

    // 隐藏旋转点
    hasRotatingPoint: false,

    lockUniScaling: false, // 禁用等比缩放
    lockScalingX: false,
    lockScalingY: false,

    originX: "left",
    originY: "top",

    strokeUniform: true,

    // 优化的缓存配置
    objectCaching: true,
    statefullCache: true,
    cacheProperties: ['width', 'height', 'left', 'top'], // 只缓存关键属性
    cacheCanvas: null, // 让Fabric.js管理缓存
    ...options,
  });
  obj.setControlsVisibility({
    ml: false,
    mt: false,
    mr: false,
    mb: false,
    mtr: false
  });


  // 不要重新创建 controls，直接使用现有的控制点
  // 只需要设置位置偏移即可

  const cornerSize = -obj.strokeWidth;

  // 设置控制点位置，使其中心与矩形角落重合
  obj.controls.tl.offsetX = -cornerSize / 2;
  obj.controls.tl.offsetY = -cornerSize / 2;

  obj.controls.tr.offsetX = cornerSize / 2;
  obj.controls.tr.offsetY = -cornerSize / 2;

  obj.controls.bl.offsetX = -cornerSize / 2;
  obj.controls.bl.offsetY = cornerSize / 2;

  obj.controls.br.offsetX = cornerSize / 2;
  obj.controls.br.offsetY = cornerSize / 2;
}

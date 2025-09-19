// ============ 全局变量区域 ============
// Three.js 核心对象
let scene, camera, renderer, controls;
let logo; // 3D logo模型对象

// 鼠标交互状态控制
let isHovering = false; // 鼠标是否在canvas区域内
let isHoveringLogo = false; // 鼠标是否精确悬停在logo上（通过射线检测）

// 鼠标位置和移动追踪
let mouseX = 0; // 当前鼠标X坐标（标准化为-1到1）
let lastMouseX = 0; // 上一帧的鼠标X坐标，用于计算移动方向

// 旋转控制变量
let targetRotationY = 0; // Y轴目标旋转角度（翻页效果）
let targetRotationZ = 0; // Z轴目标旋转角度（垂直屏幕旋转）
let currentRotationY = 0; // Y轴当前旋转角度
let currentRotationZ = 0; // Z轴当前旋转角度

// 交互状态管理
let isRotating = false; // 是否正在执行旋转动画
let interactionCount = 0; // 交互次数计数器（用于控制Y轴/Z轴交替）
let hasTriggered = false; // 防止重复触发标志

// 射线检测相关对象
let raycaster = new THREE.Raycaster(); // 用于精确检测鼠标与3D物体的交互
let mouse = new THREE.Vector2(); // 标准化的鼠标坐标

// ============ 初始化函数 ============
// 设置Three.js场景、相机、渲染器等核心组件
function init() {
    // === 场景设置 ===
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // 白色背景

    // === 相机设置（正交相机，实现等角投影效果）===
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100;
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, // left
        frustumSize * aspect / 2,  // right
        frustumSize / 2,           // top
        frustumSize / -2,          // bottom
        0.1,                       // near
        1000                       // far
    );
    camera.position.set(0, 0, 50);

    // === 渲染器设置 ===
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // 不使用阴影
    document.getElementById('container').appendChild(renderer.domElement);

    // === 控制器设置（允许用户手动旋转查看模型）===
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;

    // === 事件监听器设置 ===
    addMouseEvents();

    // === 3D模型加载 ===
    loadSTL();

    // === 启动渲染循环 ===
    animate();

    // === UI更新 ===
    document.getElementById('loading').style.display = 'none';
}

// ============ STL文件加载函数 ============
// 负责加载和处理3D模型文件
function loadSTL() {
    const loader = new THREE.STLLoader();
    
    // 加载STL文件（请将'logo.stl'替换为您的文件路径）
    loader.load('logo.stl', function (geometry) {
        // === 模型几何处理 ===
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        
        // 将几何体居中到原点
        geometry.translate(-center.x, -center.y, -center.z);

        // === 材质创建 ===
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, // 黑色
            side: THREE.DoubleSide
        });

        // === 3D网格创建 ===
        logo = new THREE.Mesh(geometry, material);
        scene.add(logo);

        // === 相机视野自适应调整 ===
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // 根据模型大小调整正交相机的视野范围
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = maxDim * 1.5; // 留一些边距
        
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();

        // === 相机位置和目标设置 ===
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        
        controls.target.set(0, 0, 0);
        controls.update();

    }, function (progress) {
        // 加载进度回调
        console.log('加载进度: ' + (progress.loaded / progress.total * 100) + '%');
    }, function (error) {
        // 加载失败回调
        console.error('STL文件加载失败:', error);
        document.getElementById('loading').textContent = '文件加载失败，请检查STL文件路径';
    });
}

// ============ 渲染循环函数 ============
// 每帧调用，处理动画更新和渲染
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    // === 处理logo旋转动画效果 ===
    if (logo) {
        if (isRotating) {
            // 惯性旋转到目标位置（平滑过渡）
            const diffY = targetRotationY - currentRotationY;
            const diffZ = targetRotationZ - currentRotationZ;
            
            // Y轴旋转插值计算
            if (Math.abs(diffY) > 0.01) {
                currentRotationY += diffY * 0.1;
            } else {
                currentRotationY = targetRotationY;
            }
            
            // Z轴旋转插值计算
            if (Math.abs(diffZ) > 0.01) {
                currentRotationZ += diffZ * 0.1;
            } else {
                currentRotationZ = targetRotationZ;
            }
            
            // 检查是否完成旋转
            if (Math.abs(diffY) <= 0.01 && Math.abs(diffZ) <= 0.01) {
                isRotating = false;
            }
        } else if (isHoveringLogo) {
            // 悬停引导效果：只有当鼠标悬停在logo上时才显示轻微摆动
            const hoverEffect = Math.sin(Date.now() * 0.005) * 0.002;
            currentRotationY += hoverEffect;
        }
        
        // 应用旋转到logo对象
        logo.rotation.y = currentRotationY;
        logo.rotation.z = currentRotationZ;
    }
    
    // 渲染场景
    renderer.render(scene, camera);
}

// ============ 鼠标事件处理函数 ============
// 控制用户与3D模型的交互
function addMouseEvents() {
    const canvas = renderer.domElement;
    
    // === 基础鼠标进入/离开事件 ===
    canvas.addEventListener('mouseenter', () => {
        isHovering = true; // 鼠标进入canvas区域
    });
    
    canvas.addEventListener('mouseleave', () => {
        isHovering = false; // 鼠标离开canvas区域
    });
    
    // === 核心交互逻辑：鼠标移动事件 ===
    canvas.addEventListener('mousemove', (event) => {
        // --- 射线检测：精确判断鼠标是否在logo上 ---
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // 检查鼠标是否悬停在logo上
        if (logo) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(logo);
            isHoveringLogo = intersects.length > 0; // 有交点则在logo上
        }
        
        // --- 手势识别：检测从右向左的移动 ---
        const currentMouseX = (event.clientX / window.innerWidth) * 2 - 1;
        
        // 只有当鼠标悬停在logo上时才能进行交互
        if (isHoveringLogo && !isRotating) {
            // 计算鼠标移动方向 (正值为向右，负值为向左)
            const deltaX = currentMouseX - lastMouseX;
            
            // 只识别从右向左的移动 (deltaX < 0) 且移动幅度足够大
            if (deltaX < -0.02 && !hasTriggered) {
                console.log('触发左移交互，deltaX:', deltaX); // 调试信息
                
                // --- 防重复触发机制 ---
                hasTriggered = true;
                isRotating = true;
                interactionCount++;
                
                // --- 旋转逻辑控制 ---
                if (interactionCount === 1) {
                    // 第一次交互：Y轴旋转90度（翻页效果）
                    targetRotationY += Math.PI / 2;
                } else if (interactionCount === 2) {
                    // 第二次交互：Z轴旋转90度（垂直屏幕旋转）
                    targetRotationZ += Math.PI / 2;
                } else {
                    // 后续交互：交替旋转Y轴和Z轴
                    if (interactionCount % 2 === 1) {
                        targetRotationY += Math.PI / 2; // 奇数次：Y轴
                    } else {
                        targetRotationZ += Math.PI / 2; // 偶数次：Z轴
                    }
                }
                
                // --- 延迟重置触发标志，防止连续触发 ---
                setTimeout(() => {
                    hasTriggered = false;
                }, 500);
                
            } else if (deltaX > 0.02) {
                console.log('检测到右移，不触发交互，deltaX:', deltaX); // 调试信息
            }
        }
        
        // --- 始终更新上一次鼠标位置（用于计算移动方向）---
        lastMouseX = currentMouseX;
    });
}

// ============ 窗口大小调整函数 ============
// 当窗口大小改变时调整渲染器和相机
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100; // 与初始化时保持一致
    
    // 更新正交相机的视野参数
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    // 更新渲染器尺寸
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============ 事件监听器注册 ============
// 注册全局事件监听器
window.addEventListener('resize', onWindowResize); // 窗口大小改变事件
window.addEventListener('load', init); // 页面加载完成事件
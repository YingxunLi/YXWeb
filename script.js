// 场景、相机、渲染器
let scene, camera, renderer, controls;
let logo;
let isHovering = false;
let mouseX = 0;
let targetRotationY = 0;
let currentRotationY = 0;
let isRotating = false;
let lastTriggerDirection = 0; // 记录最后一次触发的方向

function init() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // 白色背景

    // 创建正交相机（等角投影）
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

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // 不使用阴影
    document.getElementById('container').appendChild(renderer.domElement);

    // 添加控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;

    // 添加鼠标事件监听
    addMouseEvents();

    // 加载STL文件
    loadSTL();

    // 开始渲染循环
    animate();

    // 隐藏加载提示
    document.getElementById('loading').style.display = 'none';
}

function loadSTL() {
    const loader = new THREE.STLLoader();
    
    // 请将 'logo.stl' 替换为您的STL文件路径
    loader.load('logo.stl', function (geometry) {
        // 计算几何体的边界盒，用于居中
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        
        // 将几何体居中
        geometry.translate(-center.x, -center.y, -center.z);

        // 创建黑色材质（无光照）
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, // 黑色
            side: THREE.DoubleSide
        });

        // 创建网格
        logo = new THREE.Mesh(geometry, material);
        scene.add(logo);

        // 自动调整正交相机的视野大小以适应模型
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // 调整正交相机的视野范围
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = maxDim * 1.5; // 留一些边距
        
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();

        // 设置相机位置
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        
        controls.target.set(0, 0, 0);
        controls.update();

    }, function (progress) {
        // 加载进度
        console.log('加载进度: ' + (progress.loaded / progress.total * 100) + '%');
    }, function (error) {
        console.error('STL文件加载失败:', error);
        document.getElementById('loading').textContent = '文件加载失败，请检查STL文件路径';
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    // 处理鼠标交互的Y轴旋转效果（翻页效果）
    if (logo) {
        if (isRotating) {
            // 惯性旋转到目标位置
            const diff = targetRotationY - currentRotationY;
            if (Math.abs(diff) > 0.01) {
                currentRotationY += diff * 0.1;
            } else {
                currentRotationY = targetRotationY;
                isRotating = false;
            }
        } else if (isHovering) {
            // 鼠标悬停时的引导旋转
            currentRotationY += Math.sin(Date.now() * 0.005) * 0.002; // 轻微摆动
        }
        
        logo.rotation.y = currentRotationY;
    }
    
    renderer.render(scene, camera);
}

// 鼠标事件处理
function addMouseEvents() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mouseenter', () => {
        isHovering = true;
    });
    
    canvas.addEventListener('mouseleave', () => {
        isHovering = false;
    });
    
    canvas.addEventListener('mousemove', (event) => {
        if (isHovering && !isRotating) {
            // 将鼠标x坐标映射到-1到1的范围
            mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            
            // 检查鼠标移动方向，可以无限制旋转
            if (mouseX < -0.3 && lastTriggerDirection !== -1) {
                // 向左移动
                isRotating = true;
                lastTriggerDirection = -1;
                targetRotationY -= Math.PI / 2; // 减去90度
            } else if (mouseX > 0.3 && lastTriggerDirection !== 1) {
                // 向右移动
                isRotating = true;
                lastTriggerDirection = 1;
                targetRotationY += Math.PI / 2; // 加上90度
            } else if (Math.abs(mouseX) <= 0.2 && lastTriggerDirection !== 0) {
                // 回到中间区域，可以触发回到最近的90度倍数位置
                isRotating = true;
                lastTriggerDirection = 0;
                // 找到最近的90度倍数位置
                const nearestAngle = Math.round(targetRotationY / (Math.PI / 2)) * (Math.PI / 2);
                targetRotationY = nearestAngle;
            }
        }
    });
    
    // 添加点击事件作为备选交互方式
    canvas.addEventListener('click', (event) => {
        if (!isRotating) {
            const clickX = (event.clientX / window.innerWidth) * 2 - 1;
            isRotating = true;
            
            // 根据点击位置决定旋转方向
            if (clickX < -0.2) {
                targetRotationY -= Math.PI / 2; // 向左旋转90度
            } else if (clickX > 0.2) {
                targetRotationY += Math.PI / 2; // 向右旋转90度
            } else {
                // 点击中间区域回到最近的90度倍数位置
                const nearestAngle = Math.round(targetRotationY / (Math.PI / 2)) * (Math.PI / 2);
                targetRotationY = nearestAngle;
            }
        }
    });
}

// 窗口大小改变时调整渲染器
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100; // 与初始化时保持一致
    
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 事件监听器
window.addEventListener('resize', onWindowResize);
window.addEventListener('load', init);
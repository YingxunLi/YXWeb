// 场景、相机、渲染器
let scene, camera, renderer, controls;
let logo;
let isHovering = false;
let mouseX = 0;
let targetRotationY = 0;
let currentRotationY = 0;

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
        if (isHovering) {
            // 鼠标悬停时的引导旋转 + 鼠标移动控制
            targetRotationY = (mouseX * Math.PI / 2) + Math.sin(Date.now() * 0.005) * 0.17; // 0.17 ≈ 10度
        } else {
            // 没有悬停时保持当前位置
            targetRotationY = currentRotationY;
        }
        
        // 平滑过渡到目标旋转
        currentRotationY += (targetRotationY - currentRotationY) * 0.1;
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
        if (isHovering) {
            // 将鼠标x坐标映射到-1到1的范围
            mouseX = (event.clientX / window.innerWidth) * 2 - 1;
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
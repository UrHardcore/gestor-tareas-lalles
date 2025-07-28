document.addEventListener('DOMContentLoaded', () => {
    // --- Selección de elementos del DOM ---
    const taskForm = document.getElementById('taskForm');
    const pendingTasksContainer = document.getElementById('pendingTasks');
    const completedTasksContainer = document.getElementById('completedTasks');
    const searchInput = document.getElementById('searchInput');
    const submitTaskBtn = document.getElementById('submitTaskBtn');
    
    // Nuevos elementos para Tema e Importación
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const importBtn = document.getElementById('importBtn');
    const importModal = document.getElementById('importModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const csvFileInput = document.getElementById('csvFileInput');

    // --- Carga de Datos desde localStorage ---
    let tasks = JSON.parse(localStorage.getItem('taskflow_tasks')) || [];
    let clients = JSON.parse(localStorage.getItem('taskflow_clients')) || [];
    let editingId = null;

    // --- Funciones para Guardar Datos ---
    const saveTasks = () => localStorage.setItem('taskflow_tasks', JSON.stringify(tasks));
    const saveClients = () => localStorage.setItem('taskflow_clients', JSON.stringify(clients));

    // --- Lógica del Tema (Claro/Oscuro) ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggleBtn.textContent = '☀️';
        } else {
            document.body.classList.remove('dark-mode');
            themeToggleBtn.textContent = '🌙';
        }
    };

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('taskflow_theme', currentTheme);
        applyTheme(currentTheme);
    });

    // Aplicar tema guardado al cargar
    const savedTheme = localStorage.getItem('taskflow_theme') || 'light';
    applyTheme(savedTheme);


    // --- Lógica de Renderizado de Tareas ---
    const renderTasks = () => {
        pendingTasksContainer.innerHTML = '';
        completedTasksContainer.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();

        tasks.filter(task =>
            (task.title && task.title.toLowerCase().includes(searchTerm)) ||
            (task.clientNumber && task.clientNumber.toLowerCase().includes(searchTerm)) ||
            (task.contactName && task.contactName.toLowerCase().includes(searchTerm))
        ).forEach(task => {
            const taskCard = document.createElement('div');
            const priorityClass = `priority-${task.priority ? task.priority.toLowerCase() : 'media'}`;
            taskCard.className = `task-card ${task.isCompleted ? 'completed' : ''} ${priorityClass}`;
            taskCard.dataset.id = task.id;

            let formattedDate = 'Sin fecha';
            if (task.dateTime) {
                const date = new Date(task.dateTime);
                if (!isNaN(date.getTime())) {
                    formattedDate = date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
            }

            taskCard.innerHTML = `
                <h4 class="task-title">${task.title || 'Sin Título'}</h4>
                <div class="task-meta">
                    <span><strong>Cliente:</strong> ${task.contactName || 'N/A'} (${task.clientNumber || 'N/A'})</span>
                </div>
                <div class="task-meta-secondary">
                    <span><strong>Fecha:</strong> ${formattedDate}</span>
                    <span class="task-priority"><strong>Prioridad:</strong> ${task.priority || 'Media'}</span>
                </div>
                <p class="task-description">${task.description || ''}</p>
                <div class="task-actions">
                    <button class="edit-btn">Editar</button>
                    <button class="complete-btn">${task.isCompleted ? 'Marcar Pendiente' : 'Completar'}</button>
                    <button class="delete-btn">Eliminar</button>
                </div>`;
            
            if (task.isCompleted) completedTasksContainer.appendChild(taskCard);
            else pendingTasksContainer.appendChild(taskCard);
        });
    };

    // --- Lógica del Formulario (Crear y Editar Tareas)---
    const resetForm = () => {
        taskForm.reset();
        document.getElementById('priority').value = 'Media';
        editingId = null;
        submitTaskBtn.textContent = 'Guardar Tarea';
    };

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const taskData = {
            title: document.getElementById('taskTitle').value,
            clientNumber: document.getElementById('clientNumber').value,
            contactName: document.getElementById('contactName').value,
            dateTime: document.getElementById('taskDateTime').value,
            description: document.getElementById('taskDescription').value,
            priority: document.getElementById('priority').value,
        };

        if (editingId) {
            const taskIndex = tasks.findIndex(task => task.id === editingId);
            if (taskIndex > -1) tasks[taskIndex] = { ...tasks[taskIndex], ...taskData };
        } else {
            tasks.push({ id: Date.now(), ...taskData, isCompleted: false });
        }
        saveTasks();
        renderTasks();
        resetForm();
    });

    // --- Lógica de Acciones de Tareas (Editar, Completar, Borrar) ---
    const handleTaskAction = (e) => {
        const card = e.target.closest('.task-card');
        if (!card) return;
        const taskId = Number(card.dataset.id);
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (e.target.classList.contains('edit-btn')) {
            document.getElementById('taskTitle').value = task.title || '';
            document.getElementById('clientNumber').value = task.clientNumber || '';
            document.getElementById('contactName').value = task.contactName || '';
            document.getElementById('taskDateTime').value = task.dateTime || '';
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('priority').value = task.priority || 'Media';
            editingId = task.id;
            submitTaskBtn.textContent = 'Actualizar Tarea';
            taskForm.scrollIntoView({ behavior: 'smooth' });
        } else if (e.target.classList.contains('complete-btn')) {
            task.isCompleted = !task.isCompleted;
            saveTasks();
            renderTasks();
        } else if (e.target.classList.contains('delete-btn')) {
            if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
                tasks = tasks.filter(t => t.id !== taskId);
                saveTasks();
                renderTasks();
            }
        }
    };
    
    // --- Lógica de Importación de Clientes ---
    importBtn.addEventListener('click', () => importModal.classList.add('visible'));
    closeModalBtn.addEventListener('click', () => importModal.classList.remove('visible'));
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) importModal.classList.remove('visible');
    });

    csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            try {
                const parsedClients = parseCSV(text);
                if (parsedClients.length > 0) {
                    clients = parsedClients;
                    saveClients();
                    alert(`¡Se importaron ${clients.length} clientes con éxito!`);
                    importModal.classList.remove('visible');
                } else {
                    alert("No se encontraron clientes válidos en el archivo. Asegúrate de que las columnas 'codigo' y 'Nombre_Farmacia' existan.");
                }
            } catch (error) {
                alert("Hubo un error al procesar el archivo. Verifica que sea un CSV válido.");
                console.error(error);
            }
        };
        reader.readAsText(file, 'ISO-8859-1'); // Usar codificación para caracteres latinos
    });

    function parseCSV(text) {
        const lines = text.split(/\r\n|\n/);
        if (lines.length < 2) return [];
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const codigoIndex = headers.indexOf('codigo');
        // Buscamos un header que contenga "nombre" para ser más flexibles
        const nombreIndex = headers.findIndex(h => h.includes('nombre'));

        if (codigoIndex === -1 || nombreIndex === -1) {
            console.error("No se encontraron las columnas 'codigo' y/o 'nombre' en el CSV.");
            return [];
        }

        const clientList = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const data = lines[i].split(',');
            const client = {
                number: data[codigoIndex] ? data[codigoIndex].trim() : '',
                name: data[nombreIndex] ? data[nombreIndex].trim() : ''
            };
            if (client.number && client.name) {
                clientList.push(client);
            }
        }
        return clientList;
    }

    // --- Lógica de Autocompletado ---
    const clientNumberInput = document.getElementById('clientNumber');
    const contactNameInput = document.getElementById('contactName');

    clientNumberInput.addEventListener('input', (e) => {
        const client = clients.find(c => c.number === e.target.value);
        if (client) {
            contactNameInput.value = client.name;
        }
    });

    contactNameInput.addEventListener('input', (e) => {
        const client = clients.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
        if (client) {
            clientNumberInput.value = client.number;
        }
    });

    // --- Asignación de Event Listeners ---
    pendingTasksContainer.addEventListener('click', handleTaskAction);
    completedTasksContainer.addEventListener('click', handleTaskAction);
    searchInput.addEventListener('input', renderTasks);
    
    // --- Renderizado Inicial ---
    renderTasks();
});
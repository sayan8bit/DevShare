// ==========================================
// 🔴 SETUP INSTRUCTIONS FOR GITHUB API 🔴
// ==========================================
// To host this on GitHub Pages and let users save directly to a JSON file in your repository:
// 1. Change YOUR_GITHUB_USERNAME and YOUR_REPOSITORY_NAME below.
// 2. Push this code to the "main" branch of your repository.
// 3. To add/edit projects from the app, you will need a GitHub Personal Access Token (PAT).
//    (Generate at GitHub -> Settings -> Developer Settings -> Personal access tokens -> Tokens (classic)).
//    Give it the "repo" scope. When you try to save a project, the app will ask for this token.
// ==========================================

const githubConfig = {
    owner: "sayan8bit", // e.g., "sayan-dev"
    repo: "DevShare", // e.g., "developer-share-project"
    branch: "main",
    filePath: "data/projects.json" // the file we just created
};

// Check if configured
const isGithubConfigured = githubConfig.owner !== "sayan8bit";

// State management
let projects = [];
let activeTag = 'all';
let searchQuery = '';
let fileSha = null; // We need the file SHA to update it via GitHub API

// DOM Elements
const projectsGrid = document.getElementById('projectsGrid');
const searchInput = document.getElementById('searchInput');
const tagFilters = document.getElementById('tagFilters');
const postModal = document.getElementById('postModal');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const projectForm = document.getElementById('projectForm');
const filtersSection = document.querySelector('.filters');

// Initialization
function init() {
    setupEventListeners();

    if (isGithubConfigured) {
        fetchProjectsFromGithub();
    } else {
        showConfigAlert();
        // Fallback to local loading if possible (will only work via a server locally)
        try {
            fetch('data/projects.json')
                .then(res => res.json())
                .then(data => {
                    projects = data;
                    renderProjects();
                })
                .catch(e => renderProjects());
        } catch (e) {
            renderProjects();
        }
    }
}

function showConfigAlert(customMessage = null) {
    if (document.getElementById('github-alert')) return;

    const banner = document.createElement('div');
    banner.id = 'github-alert';
    banner.style.width = "100%";
    banner.style.background = "rgba(42, 23, 56, 0.8)";
    banner.style.border = "1px solid var(--accent-primary)";
    banner.style.padding = "1rem 1.5rem";
    banner.style.borderRadius = "var(--radius-md)";
    banner.style.marginBottom = "2rem";
    banner.style.backdropFilter = "blur(10px)";
    banner.innerHTML = `
        <h3 style="color: var(--accent-primary); margin-bottom: 0.5rem;"><i class="fa-brands fa-github"></i> Setup Required for Commits</h3>
        <p style="color: var(--text-primary); font-size: 0.95rem; line-height: 1.5;">
            ${customMessage || `To enable saving directly to GitHub via the frontend:<br>
            1. Open <code>script.js</code> and update <code>githubConfig.owner</code> and <code>githubConfig.repo</code>.<br>
            2. Push your code to your GitHub repo.<br>
            3. Upon publishing, the app will ask for a Personal Access Token.`}
        </p>
    `;
    filtersSection.parentNode.insertBefore(banner, filtersSection.nextSibling);
}

// Fetch from GitHub
async function fetchProjectsFromGithub() {
    try {
        const url = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.filePath}?ref=${githubConfig.branch}`;
        const response = await fetch(url + "&t=" + Date.now(), { // timestamp to prevent caching
            headers: { "Accept": "application/vnd.github.v3+json" }
        });

        if (!response.ok) {
            if (response.status === 404) {
                projects = [];
                renderProjects();
                return;
            }
            throw new Error(`Failed to fetch from GitHub: ${response.status}`);
        }

        const data = await response.json();
        fileSha = data.sha; // Save SHA for updates

        // Decode Base64 content from GitHub
        const content = decodeURIComponent(escape(atob(data.content)));
        if (content.trim() !== '') {
            projects = JSON.parse(content);
        } else {
            projects = [];
        }
        renderProjects();

    } catch (error) {
        console.error("Error fetching projects:", error);
        showConfigAlert("Could not read projects.json from GitHub. Make sure your repository is public or your owner/repo settings are correct.");
    }
}

// Ensure valid Base64 string from Unicode text
function b64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

// Commit to GitHub
async function commitToGithub(jsonContent, commitMessage) {
    let token = localStorage.getItem('github_pat');

    if (!token) {
        token = prompt("Please enter your GitHub Personal Access Token (PAT) to commit this to the repository.\n\nNote: This will be saved in your browser's LocalStorage securely.");
        if (!token) {
            alert("Cancelling action. A token is required to make a commit via the GitHub API.");
            return false;
        }
        localStorage.setItem('github_pat', token);
    }

    try {
        const url = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.filePath}`;

        const payload = {
            message: commitMessage,
            content: b64EncodeUnicode(jsonContent),
            branch: githubConfig.branch
        };

        if (fileSha) {
            payload.sha = fileSha;
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401 || response.status === 403) {
                alert("Authentication failed! Your token might be expired, invalid, or lack the 'repo' scope. I'll ask for a new token next time.");
                localStorage.removeItem('github_pat');
            } else if (response.status === 409) {
                alert("Conflict error! Someone else updated the file. Please refresh the page and try again.");
            } else {
                alert(`Error from GitHub: ${errorData.message}`);
            }
            return false;
        }

        const responseData = await response.json();
        fileSha = responseData.content.sha; // Update SHA for next time
        return true;

    } catch (error) {
        console.error("Commit error:", error);
        alert("An unexpected error occurred while communicating with GitHub.");
        return false;
    }
}

// Render projects based on filters
function renderProjects() {
    projectsGrid.innerHTML = '';

    // Sort descending by date
    const sortedProjects = [...projects].sort((a, b) => b.createdAt - a.createdAt);

    // Filter projects
    let filteredProjects = sortedProjects.filter(project => {
        const matchesTag = activeTag === 'all' ||
            (project.tags && project.tags.some(tag => tag.toLowerCase() === activeTag.toLowerCase()));

        const queryStr = searchQuery.toLowerCase();
        const matchesSearch = project.title.toLowerCase().includes(queryStr) ||
            (project.tags && project.tags.some(tag => tag.toLowerCase().includes(queryStr))) ||
            project.description.toLowerCase().includes(queryStr);

        return matchesTag && matchesSearch;
    });

    if (filteredProjects.length === 0) {
        projectsGrid.innerHTML = `
            <div class="no-results">
                <i class="fa-solid fa-ghost"></i>
                <h3>No projects found</h3>
                <p>Try adjusting your search or filters</p>
            </div>
        `;
        return;
    }

    filteredProjects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';

        const tagsHtml = (project.tags || []).map(tag => {
            const tagLower = tag.toLowerCase();
            let tagClass = 'tag';
            if (['html', 'css', 'javascript', 'python', 'react'].includes(tagLower)) {
                tagClass += ` ${tagLower}`;
            }
            return `<span class="${tagClass}">${tag}</span>`;
        }).join('');

        const imageUrl = project.image || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80';

        card.innerHTML = `
            <div class="card-actions">
                <button class="action-btn edit-btn" data-id="${project.id}" title="Edit Project">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn delete" data-id="${project.id}" title="Delete Project">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <img src="${imageUrl}" alt="${project.title}" class="project-image" loading="lazy">
            <div class="project-content">
                <h3 class="project-title">${project.title}</h3>
                <div class="project-tags">
                    ${tagsHtml}
                </div>
                <p class="project-desc">${project.description}</p>
                
                <div class="project-footer">
                    ${project.github ? `
                    <a href="${project.github}" target="_blank" rel="noopener noreferrer" class="card-link">
                        <i class="fa-brands fa-github"></i> Code
                    </a>` : '<div></div>'}
                    
                    ${project.demo ? `
                    <a href="${project.demo}" target="_blank" rel="noopener noreferrer" class="card-link demo">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Live Demo
                    </a>` : ''}
                </div>
            </div>
        `;

        projectsGrid.appendChild(card);
    });
}

// Event Listeners setup
function setupEventListeners() {
    projectsGrid.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete');

        if (deleteBtn) {
            const id = deleteBtn.getAttribute('data-id');
            const pTitle = projects.find(p => p.id === id)?.title || 'Project';
            if (confirm(`Are you sure you want to delete "${pTitle}"?`)) {

                // Copy array array and try saving it
                const backup = [...projects];
                projects = projects.filter(p => p.id !== id);
                renderProjects();

                if (isGithubConfigured) {
                    const success = await commitToGithub(JSON.stringify(projects, null, 2), `Delete project: ${pTitle}`);
                    if (!success) {
                        projects = backup;
                        renderProjects(); // revert visually
                    }
                } else {
                    alert("Configure GitHub Settings first at the top of script.js to perform commits.");
                    projects = backup;
                    renderProjects();
                }
            }
        }

        if (editBtn) {
            const id = editBtn.getAttribute('data-id');
            const project = projects.find(p => p.id === id);
            if (project) {
                // Populate form
                document.getElementById('pId').value = project.id;
                document.getElementById('pTitle').value = project.title;
                document.getElementById('pDesc').value = project.description;
                document.getElementById('pImage').value = project.image || '';
                document.getElementById('pGithub').value = project.github || '';
                document.getElementById('pDemo').value = project.demo || '';
                document.getElementById('pTags').value = (project.tags || []).join(', ');

                document.getElementById('modalTitle').textContent = 'Edit Project';
                document.getElementById('submitProjectBtn').textContent = 'Save Changes';

                openModal();
            }
        }
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderProjects();
    });

    tagFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-btn')) {
            document.querySelectorAll('.tag-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            activeTag = e.target.getAttribute('data-tag');
            renderProjects();
        }
    });

    const openModal = () => {
        postModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        postModal.classList.remove('active');
        document.body.style.overflow = '';
        projectForm.reset();
        document.getElementById('pId').value = '';
        document.getElementById('modalTitle').textContent = 'Post a New Project';
        document.getElementById('submitProjectBtn').textContent = 'Publish Project';
    };

    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    postModal.addEventListener('click', (e) => {
        if (e.target === postModal) closeModal();
    });

    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('pTitle').value;
        const description = document.getElementById('pDesc').value;
        const image = document.getElementById('pImage').value;
        const github = document.getElementById('pGithub').value;
        const demo = document.getElementById('pDemo').value;
        const tagsInput = document.getElementById('pTags').value;

        const tags = tagsInput.split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);

        const existingId = document.getElementById('pId').value;

        const projectData = {
            id: existingId ? existingId : Date.now().toString(),
            title,
            description,
            image,
            github,
            demo,
            tags: tags.length > 0 ? tags : ['Project'],
            createdAt: existingId ? projects.find(p => p.id === existingId)?.createdAt : Date.now()
        };


        const backup = [...projects];

        if (existingId) {
            const index = projects.findIndex(p => p.id === existingId);
            if (index !== -1) projects[index] = projectData;
        } else {
            projects.unshift(projectData);
        }

        // Show loading state implicitly on button
        const submitBtn = document.getElementById('submitProjectBtn');
        const oldText = submitBtn.textContent;
        submitBtn.textContent = 'Committing...';
        submitBtn.disabled = true;

        if (isGithubConfigured) {
            const message = existingId ? `Update project: ${title}` : `Add project: ${title}`;
            const success = await commitToGithub(JSON.stringify(projects, null, 2), message);
            if (!success) {
                projects = backup;
            } else {
                closeModal();
            }
        } else {
            alert("Configure GitHub Settings first at the top of script.js to perform commits.");
            projects = backup;
        }

        submitBtn.textContent = oldText;
        submitBtn.disabled = false;
        renderProjects();
    });
}

// Boot the app
document.addEventListener('DOMContentLoaded', init);

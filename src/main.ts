// Terminal Website - Main TypeScript File
// main.ts

// Types for our content
interface ContentPage {
  type: 'page';
  title: string;
  content: (ContentItem | string)[];
}

interface ContentItem {
  type: 'text' | 'image' | 'link' | 'selection' | 'input' | 'button';
  content: string;
  url?: string;
  options?: OptionItem[];
  action?: string;
  id?: string;
  class?: string | string[];
  // Only applies to link type
  'navigation-dir'?: 'back' | 'forward';
  // Only applies to selection type, leave empty for numeric bullets
  bullet?:string;
}

interface OptionItem {
  content : string;
  url: string; 
}

// State management
class TerminalState {
  private currentPage: ContentPage | null = null;
  private contentData: Record<string, ContentPage> = {};
  private terminal: HTMLElement;
  private printSpeed = 5; // ms between characters
  private printQueue: (() => Promise<void>)[] = [];
  private printing = false;
  
  constructor(terminalId: string) {
    this.terminal = document.getElementById(terminalId) || document.body;
    this.setupCRTEffect();
  }

  // Load content from JSON
  public async loadContent(jsonUrl: string): Promise<void> {
    try {
      const response = await fetch(jsonUrl);
      this.contentData = await response.json();
      console.log('Content loaded:', this.contentData);
    } catch (error) {
      console.error('Failed to load content:', error);
      this.print('Error: Failed to load content. Please check console for details.');
    }
  }

  // Navigate to a specific page
  public navigateTo(pageId?: string): void {
    if (!pageId) return;
    if (this.isExternalLink(pageId)){
      window.open(pageId, '_blank');
    } else {
      pageId = pageId.substring(1); // remove prefix #
      if (this.contentData[pageId]) {
        this.clearTerminal();
        this.currentPage = this.contentData[pageId];
        this.renderPage(this.currentPage,pageId);
      } else {
        this.printError(`Error: page '${pageId}' not found.`);
      }  
    }
  }

  // Clear the terminal screen
  private clearTerminal(): void {
    this.printQueue = [];
    this.terminal.innerHTML = '';
  }

  // Render a content page
  private renderPage(page: ContentPage,pageId:string): void {
    // Add title
    const titleElement = document.createElement('p');
    titleElement.className = 'terminal-title';
    this.terminal.appendChild(titleElement);
    
    this.queuePrint(async () => {
      await this.typeText(titleElement, page.title);
      return Promise.resolve();
    });

    // Process each content item
    page.content.forEach(item => {
      this.renderContentItem(item);
    });

    if (pageId != 'home'){
      const back : ContentItem = {
        type: 'link',
        content: 'Restart program', 
        'navigation-dir': 'back',
        url: '#home'
      }
      this.renderContentItem(back);
    }
    
    // Start printing from queue
    this.processQueue();
  }

  // Add a print function to the queue
  private queuePrint(printFn: () => Promise<void>): void {
    this.printQueue.push(printFn);
  }
  
  // Process the print queue
  private async processQueue(): Promise<void> {
    if (this.printing || this.printQueue.length === 0) return;
    
    this.printing = true;
    
    while (this.printQueue.length > 0) {
      const printFn = this.printQueue.shift();
      if (printFn) {
        try {
          await printFn();
        } catch (error){
          console.error('Error printing:', error);
        }
        
      }
    }
    
    this.printing = false;
  }

  private isExternalLink(url:string): boolean {
    return !(url && url.startsWith('#'));
  }

  // Render individual content item
  private renderContentItem(rawItem: ContentItem | string): void {
    let item : ContentItem
    if (typeof rawItem === 'string'){
      item = {
        type: 'text',
        content: rawItem
      }
    } else {
      item = rawItem
    }
    let element: HTMLElement;
    let id_element : any = null;
    switch (item.type) {
      case 'text':
        const paragraph = document.createElement('p');
        element = paragraph;
        paragraph.className = 'terminal-text';
        this.terminal.appendChild(paragraph);
        this.queuePrint(async () => {
          await this.typeText(paragraph, item.content);
          return Promise.resolve();
        });
        break;
        
      case 'image':
        const imgContainer = document.createElement('div');
        element = imgContainer;
        imgContainer.className = 'image-container';
        this.terminal.appendChild(imgContainer);
        
        this.queuePrint(async () => {
          await this.loadImageProgressively(imgContainer, item.content);
          return Promise.resolve();
        });
        break;
        
      case 'link':
        const linkContainer = document.createElement('div');
        element = linkContainer;
        linkContainer.className = 'link-container';
        this.terminal.appendChild(linkContainer);
        const linkElement = document.createElement('a');
        id_element = linkElement;
      
        this.queuePrint(async () => {
          linkElement.href = item.url || '#';
          linkElement.className = 'terminal-link';
          
          let prefix:string;
          // If it's an internal link
          if (item.url && !this.isExternalLink(item.url)){
            if (item["navigation-dir"] == 'back'){
              prefix = '◃ '
            } else {
              prefix = '▹ ';
            }
          } else {
            linkElement.target = '_blank';
            prefix = '▹▹ ';
          }
          linkElement.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigateTo(item.url);
          });
          
          linkContainer.appendChild(linkElement);
          await this.typeText(linkElement, prefix + item.content);
          return Promise.resolve();
        });
        break;
        
      case 'selection':
        const selectContainer = document.createElement('div');
        element = selectContainer;
        selectContainer.className = 'select-container';
        this.terminal.appendChild(selectContainer);
        
        this.queuePrint(async () => {
          const selectLabel = document.createElement('span');
          selectLabel.className = 'select-label';
          selectContainer.appendChild(selectLabel);
          await this.typeText(selectLabel, `${item.content}`);
          
          const selectElement = document.createElement('div');
          selectElement.className = 'terminal-select';
          selectContainer.appendChild(selectElement);
          
          if (item.options) {
            item.options.forEach((option, index) => {
              const optionElement = document.createElement('div');
              optionElement.className = 'select-option';
              if (item.bullet){
                optionElement.textContent = `${item.bullet} ${option.content}`;
              } else {
                optionElement.textContent = `${index + 1}. ${option.content}`;
              }
          
              optionElement.addEventListener('click', () => {
                // Handle selection
                this.navigateTo(option.url);
              });
              selectElement.appendChild(optionElement);
            });
          }
          
          return Promise.resolve();
        });
        break;
        
      case 'input':
        const inputContainer = document.createElement('div');
        element = inputContainer;
        inputContainer.className = 'input-container';
        this.terminal.appendChild(inputContainer);
        const inputElement = document.createElement('input');
        id_element = inputElement;      
        this.queuePrint(async () => {
          const inputLabel = document.createElement('span');
          inputLabel.className = 'input-label';
          inputContainer.appendChild(inputLabel);
          await this.typeText(inputLabel, `${item.content}:`);
          
          inputElement.type = 'text';
          inputElement.className = 'terminal-input';
          inputContainer.appendChild(inputElement);
          
          return Promise.resolve();
        });
        break;
        
      case 'button':
        const buttonContainer = document.createElement('div');
        element = buttonContainer;
        buttonContainer.className = 'button-container';
        this.terminal.appendChild(buttonContainer);
        
        const buttonElement = document.createElement('button');
        element = buttonElement;
      this.queuePrint(async () => {
          buttonElement.className = 'terminal-button';
          const action = item.action;
          if (action != null){
            buttonElement.addEventListener('click', () => {
              eval(action);
            });
          }
            
          buttonContainer.appendChild(buttonElement);
          await this.typeText(buttonElement, item.content);
          return Promise.resolve();
        });
        break;
    }
    if (item.class){
      if (Array.isArray(item.class)){
        item.class.forEach((cls) => {
          element.classList.add(cls);
        });
      } else {
        element.classList.add(item.class);
      }
    }
    const id = item.id || 'input-' + Math.random().toString(36).substring(2);
    if (id_element instanceof HTMLElement){
      id_element.id = id;
    } else {
      element.id = id;
    }
  }

  // Type text with delay to mimic old terminals
  private async typeText(element: HTMLElement, text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!element.isConnected){
        resolve();
        return
      }
      let i = 0;
      const typeNextChar = () => {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
          setTimeout(typeNextChar, this.printSpeed);
        } else {
          resolve();
        }
      };
      
      element.textContent = '';
      typeNextChar();
    });
  }

  // Load and display an image progressively
  private async loadImageProgressively(container: HTMLElement, imageUrl: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.className = 'terminal-image';
      img.style.opacity = '0';
      
      container.innerHTML = `<div class="loading-text">Loading image...</div>`;
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      if (!ctx){
        container.innerHTML = `<div class="error-text">Error creating context</div>`;
        resolve();
        return
      }

      img.onload = () => {
        container.innerHTML = '';
        container.appendChild(canvas);
        canvas.width = img.width;
        canvas.height = img.height;  
        
        let height = 0;
        const STEP=img.height/50;
        const drawImage = () => {
          if (!canvas.isConnected){
            resolve();
            return
          }
          if (height < img.height) {
            // Randomly pause to simulate loading
            if (Math.random() < 0.1) {
              setTimeout(drawImage,100);
              return;
            }
            let new_height = height + STEP;
            ctx.drawImage(img, 0, height, img.width, STEP, 0, height, img.width, STEP);
            height = new_height;
            setTimeout(drawImage, 10);
          } else {
            resolve();
          }
        };
        drawImage();
      }
      
      img.onerror = () => {
        container.innerHTML = `<div class="error-text">Error loading image: ${imageUrl}</div>`;
        resolve();
      };
      
      // Set source to begin loading
      img.src = imageUrl;
    });
  }

  // Simple print message function
  public print(message: string): void {
    const paragraph = document.createElement('p');
    paragraph.className = 'terminal-text';
    this.terminal.appendChild(paragraph);
    
    this.queuePrint(async () => {
      await this.typeText(paragraph, message);
      return Promise.resolve();
    });
    
    this.processQueue();
  }

  public printError(message: string): void {
    const paragraph = document.createElement('p');
    paragraph.className = 'terminal-text error-text';
    this.terminal.appendChild(paragraph);
    
    this.queuePrint(async () => {
      await this.typeText(paragraph, message);
      return Promise.resolve();
    });
    
    this.processQueue();
  }

  // Set up CRT effect
  private setupCRTEffect(): void {
    // Create CRT overlay

    const scanMove = document.createElement('div');
    scanMove.id = 'scan-effect';
    document.body.appendChild(scanMove);


    const overlay = document.createElement('div');
    overlay.className = 'crt-overlay';
    document.body.appendChild(overlay);

    const crtOverlay = document.body;
    // Random CRT distortion effect
    setInterval(() => {
      const intensity = Math.random() * 10;
      if (intensity >9) {
        crtOverlay.classList.add('crt-distort');
        setTimeout(() => {
          crtOverlay.classList.remove('crt-distort');
        }, 100 + Math.random() * 200);
      }
    }, 2000);
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const terminal = new TerminalState('terminal');
  
  // Load content and navigate to the home page
  terminal.loadContent('content.json').then(() => {
    terminal.navigateTo('#home');
  });
});

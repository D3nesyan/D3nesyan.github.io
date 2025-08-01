class TypeWriter {
  constructor(element, subtitles = [], options = {}) {
    this.element = element;
    this.subtitles = subtitles;
    if (this.subtitles.length === 0) {
      this.subtitles = [this.element.textContent];
    }
    this.currentSubtitleIndex = 0;
    this.currentText = '';
    this.isDeleting = false;

    // Default options
    this.options = {
      typingSpeed: 500,        // Typing speed (ms)
      deletingSpeed: 100,      // Deleting speed (ms)
      pauseBeforeDelete: 2000, // Time to pause before deleting (ms)
      pauseBeforeType: 500     // Time to pause before typing next subtitle (ms)
    };

    // Merge user options with default options
    Object.assign(this.options, options);

    // Start typing
    this.type();
  }

  type() {
    const currentSubtitle = this.subtitles[this.currentSubtitleIndex];

    // Calculate current typing speed
    let typingSpeed = this.options.typingSpeed;

    if (this.isDeleting) {
      // Deleting state
      this.currentText = currentSubtitle.substring(0, this.currentText.length - 1);
      typingSpeed = this.options.deletingSpeed;
    } else {
      // Typing state
      this.currentText = currentSubtitle.substring(0, this.currentText.length + 1);
    }

    // Update the element with the current text
    this.element.textContent = this.currentText;

    // Check if we need to switch states
    if (!this.isDeleting && this.currentText === currentSubtitle) {
      // Typing completed, prepare to delete
      this.isDeleting = true;
      typingSpeed = this.options.pauseBeforeDelete;
    } else if (this.isDeleting && this.currentText === '') {
      // Deleting completed, prepare to type next subtitle
      this.isDeleting = false;
      this.currentSubtitleIndex = (this.currentSubtitleIndex + 1) % this.subtitles.length;
      typingSpeed = this.options.pauseBeforeType;
    }

    // Set a timeout to call the type function again
    setTimeout(() => this.type(), typingSpeed);
  }
}

// Initialize the TypeWriter when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  const subtitleElement = document.querySelector('.site-subtitle');

  const subtitles = CONFIG.subtitle_typing.subtitles || [];

  // Create a new TypeWriter instance
  new TypeWriter(subtitleElement, subtitles, {
    typingSpeed: CONFIG.subtitle_typing.typing_speed,
    deletingSpeed: CONFIG.subtitle_typing.deleting_speed,
    pauseBeforeDelete: CONFIG.subtitle_typing.pause_before_delete,
    pauseBeforeType: CONFIG.subtitle_typing.pause_before_type
  });
});

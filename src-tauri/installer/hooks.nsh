; Yule Log installer theme. Tauri includes this file before it builds the
; installer pages, so these Modern UI settings apply to them.

; Soot-dark header and welcome/finish pages with warm cream text, matching the
; background of header.bmp and sidebar.bmp.
!define MUI_BGCOLOR "1A0E09"
!define MUI_TEXTCOLOR "F3E3C8"
!define MUI_HEADERIMAGE_RIGHT
; Themed checkboxes ignore the text color and would draw black on the dark
; finish page, so use classic ones there.
!define MUI_FORCECLASSICCONTROLS

!define MUI_WELCOMEPAGE_TITLE "Winter is coming to the Midwest."
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "Yule Log is a fireplace that runs on your graphics card. A local AI model writes Christmas carols, one after another, and every word it writes goes on the fire.$\r$\n$\r$\nYou'll need LM Studio (or another local OpenAI-compatible server) and a model to burn. Gemma 4 E4B is the default.$\r$\n$\r$\nClick Next to bring in the firewood."

!define MUI_FINISHPAGE_TITLE "The firewood is stacked."
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TEXT "Yule Log is installed. Light it whenever the house gets cold, and set the auto-off timer before bed.$\r$\n$\r$\nStay warm out there."

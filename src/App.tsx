import { FamilyTreeProvider, useFamilyTree } from './context/FamilyTreeContext'
import { FamilyTreeView } from './components/FamilyTreeView'
import { TreeManager } from './components/TreeManager'
import './App.css'

function AppContent() {
  const { currentView, allTrees, activeTreeId, createTree, selectTree, renameTree, deleteTree, exportTree, importTree } = useFamilyTree();

  if (currentView === 'manager') {
    return (
      <TreeManager
        trees={allTrees}
        activeTreeId={activeTreeId}
        onCreateTree={createTree}
        onSelectTree={selectTree}
        onRenameTree={renameTree}
        onDeleteTree={deleteTree}
        onExportTree={exportTree}
        onImportTree={importTree}
      />
    );
  }

  return <FamilyTreeView />;
}

function App() {
  return (
    <FamilyTreeProvider>
      <AppContent />
    </FamilyTreeProvider>
  )
}

export default App

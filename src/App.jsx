import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Results from './pages/Results'
import About from './pages/About'
import DiseaseLibrary from './pages/DiseaseLibrary'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/results" element={<Results />} />
          <Route path="/diseases" element={<DiseaseLibrary />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

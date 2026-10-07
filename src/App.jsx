import Header from './components/Header.jsx'
import ScrollStory from './components/ScrollStory.jsx'
import Process from './components/Process.jsx'
import Contact from './components/Contact.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <ScrollStory />
        <Process />
        <Contact />
      </main>
      <Footer />
    </>
  )
}

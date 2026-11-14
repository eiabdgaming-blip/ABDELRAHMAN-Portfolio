import { About, Contact, FAQ, Feedback, Footer, Services } from '../components/editorial-sections'
import { Hero } from '../components/hero'
import { Marquee, Timeline } from '../components/motion-sections'
import { Navigation } from '../components/navigation'
import { ReelRail } from '../components/reel-rail'
import { playerItem, projectPlayerItem } from '../domain/display'
import { localReview, portfolioRepository } from '../server/review'
import { publishedHomeReels } from '../server/published-media'
import { publicSiteContent } from '../server/site-content'
import { homePortfolioContent } from '../server/portfolio-cms'
import { SelectedProjects } from '../components/portfolio-projects'
import { publicMetadata } from '../server/site-metadata'

export function generateMetadata() {
  return publicMetadata('/', 'ABDELRAHMAN | Video Editor & Motion Designer',
    'Explore Abdelrahman’s showreel, video editing and motion design work, and services for short-form and long-form projects.')
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const [review, query] = await Promise.all([localReview(), searchParams])
  const [{ showreel, featuredReels: fixtures }, published, { services, questions, contact }, portfolio] = await Promise.all([
    portfolioRepository(review).getHome(),
    publishedHomeReels(),
    publicSiteContent(review),
    homePortfolioContent(),
  ])
  const featuredReels = published.length ? published : fixtures
  const featured = featuredReels.slice(0, 6).map(projectPlayerItem)
  const selectedService = services.find(([key]) => key === query.service)?.[0] ?? ''
  return (
    <>
      {showreel && <link rel="preload" href="/videos/showreel-poster.png" as="image" fetchPriority="high" />}
      <Navigation initial="home" />
      <main id="main" tabIndex={-1}>
        <Hero
  showreel={
    showreel
      ? {
          ...playerItem('Showreel', 'showreel-poster', showreel),
          src: '/videos/showreel.mp4',
          poster: '/videos/showreel-poster.png',
        }
      : undefined
  }
/>
        <section id="reels" className="home-reels container" tabIndex={-1} aria-labelledby="reels-heading" data-empty={!featured.length}>
          <div className="section-intro">
            <span className="eyebrow">Selected work</span>
            <h2 className="metallic-heading" id="reels-heading">REELS</h2>
          </div>
          {featured.length ? <ReelRail key={featured.map(({ id }) => id).join(',')} items={featured} initial={1} home /> : <p className="empty-state">No reels are available yet.</p>}
        </section>
        <SelectedProjects projects={portfolio.projects} />
        <Timeline />
        <Marquee />
        <Services services={services} />
        <Feedback review={review} entries={portfolio.feedback} />
        <About />
        <FAQ questions={questions} />
        <Contact key={selectedService} selectedService={selectedService} services={services} contact={contact} />
      </main>
      <Footer contact={contact} />
    </>
  )
}

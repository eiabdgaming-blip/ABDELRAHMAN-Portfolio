import { About, Contact, FAQ, Feedback, Footer, Services } from '../components/editorial-sections'
import { Hero } from '../components/hero'
import { Marquee, Timeline } from '../components/motion-sections'
import { Navigation } from '../components/navigation'
import { ReelRail } from '../components/reel-rail'
import { playerItem, projectPlayerItem } from '../domain/display'
import { localReview, portfolioRepository } from '../server/review'
import { publishedHomeReels } from '../server/published-media'
import { publicSiteContent } from '../server/site-content'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const [review, query] = await Promise.all([localReview(), searchParams])
  const [{ showreel, featuredReels: fixtures }, published, { services, questions, contact }] = await Promise.all([
    portfolioRepository(review).getHome(),
    publishedHomeReels(),
    publicSiteContent(review),
  ])
  const featuredReels = published.length ? published : fixtures
  const featured = featuredReels.slice(0, 6).map(projectPlayerItem)
  const selectedService = services.find(([key]) => key === query.service)?.[0] ?? ''
  return (
    <>
      <Navigation initial="home" />
      <main id="main">
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
        <Timeline review={review} />
        <Marquee />
        <Services services={services} />
        <Feedback review={review} />
        <About review={review} />
        <FAQ questions={questions} />
        <Contact key={selectedService} review={review} selectedService={selectedService} services={services} contact={contact} />
      </main>
      <Footer contact={contact} />
    </>
  )
}

import { Controller } from 'react-hook-form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { searchCourses } from '@/lib/course-search';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Play,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CourseCard } from '@/components/course-card';
import { QueryState } from '@/components/query-state';
import type { Course, Enrollment } from '@/lib/api';
export function ExplorePage({
  courses,
  enrollments,
  loading,
  error,
  onOpen,
  onTeach,
  onRefresh,
}: {
  courses: Course[];
  enrollments: Enrollment[];
  loading: boolean;
  error: Error | null;
  onOpen: (course: Course) => void;
  onTeach: () => void;
  onRefresh: () => void;
}) {
  const filters = useForm({
    defaultValues: { query: '', category: 'All courses', price: 'all', sort: 'featured' },
  });
  const query = filters.watch('query'),
    category = filters.watch('category');
  const setQuery = (query: string) => filters.setValue('query', query);
  const setCategory = (category: string) => filters.setValue('category', category);
  const categories = ['All courses', 'Development', 'Design', 'Business', 'Driving'];
  const filtered = searchCourses(courses, filters.watch());
  const courseCard = (course: Course) => (
    <CourseCard
      key={course.id}
      course={course}
      enrollment={enrollments.find((e) => e.course_id === course.id)}
      onOpen={onOpen}
    />
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span />A LITTLE CURIOSITY. A WORLD OF POSSIBILITY.
          </div>
          <h1>
            Your next chapter
            <br />
            starts with <em>learning.</em>
          </h1>
          <p>
            Big ambitions start with small steps. Discover practical courses
            <br className="desktop-break" /> from tutors who love what they do.
          </p>
          <Button
            size="lg"
            onClick={() =>
              document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Find your next skill <ArrowRight size={18} />
          </Button>
          <div className="hero-proof">
            <div className="mini-avatars">
              <span>AM</span>
              <span>SC</span>
              <span>JL</span>
            </div>
            <span>Learn from people who do it every day.</span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-grid" />
          <div className="floating-label">
            <Sparkles size={17} /> Invest in yourself
          </div>
          <div className="visual-window">
            <div className="window-top">
              <span />
              <span />
              <span />
              <small>your-next-chapter.tsx</small>
            </div>
            <div className="code-lines">
              <p>
                <span>const</span> future = {'{'}
              </p>
              <p>
                &nbsp;&nbsp;curiosity: <b>"limitless"</b>,
              </p>
              <p>
                &nbsp;&nbsp;possibilities: <b>Infinity</b>,
              </p>
              <p>
                &nbsp;&nbsp;nextStep: <b>"start learning"</b>
              </p>
              <p>{'}'}</p>
            </div>
            <div className="visual-footer">
              <div className="play-circle">
                <Play size={19} fill="currentColor" />
              </div>
              <div>
                <strong>A new skill. A new perspective.</strong>
                <small>Make your next move.</small>
              </div>
            </div>
          </div>
          <div className="floating-achievement">
            <span>
              <Check size={19} />
            </span>
            <div>
              <strong>One step closer</strong>
              <small>Progress looks good on you.</small>
            </div>
          </div>
          <div className="visual-star">✳</div>
        </div>
      </section>
      <section className="benefits">
        <span>
          <BookOpen size={20} />
          <div>
            <strong>Learn at your pace</strong>
            <small>Your schedule. Your journey.</small>
          </div>
        </span>
        <span>
          <Users size={20} />
          <div>
            <strong>Real experience, shared</strong>
            <small>Practical skills from passionate tutors.</small>
          </div>
        </span>
        <span>
          <CheckCircle2 size={20} />
          <div>
            <strong>Make every lesson count</strong>
            <small>Build skills you can put to work.</small>
          </div>
        </span>
      </section>
      <section id="catalog" className="catalog">
        <div className="section-head">
          <div>
            <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
            <h2>What will you learn next?</h2>
            <p>Find the right course for wherever you’re headed.</p>
          </div>
          <div className="search">
            <Search size={18} />
            <Input
              aria-label="Search courses"
              placeholder="Search courses, topics, or tutors"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="category-row">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? 'selected' : ''}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
          <span>{filtered.length} courses to explore</span>
        </div>
        <div className="catalog-filters">
          <label>
            Price
            <Controller
              control={filters.control}
              name="price"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Filter by price">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All prices</SelectItem>
                    <SelectItem value="free">Free courses</SelectItem>
                    <SelectItem value="paid">Paid courses</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </label>
          <label>
            Sort by
            <Controller
              control={filters.control}
              name="sort"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Sort courses">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured">Featured order</SelectItem>
                    <SelectItem value="title">Title A–Z</SelectItem>
                    <SelectItem value="price-low">Price: low to high</SelectItem>
                    <SelectItem value="price-high">Price: high to low</SelectItem>
                    <SelectItem value="lessons">Most lessons</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </label>
          <Button variant="ghost" onClick={() => filters.reset()}>
            Clear filters
          </Button>
          <span className="muted small" role="status">
            {filtered.length} {filtered.length === 1 ? 'course' : 'courses'} found
          </span>
        </div>
        {loading ? (
          <QueryState loading />
        ) : filtered.length ? (
          <div className="course-grid">{filtered.map(courseCard)}</div>
        ) : (
          <div className="empty">
            <Search size={30} />
            <h3>{error ? 'Courses are unavailable' : 'No courses found'}</h3>
            <p>
              {error
                ? 'Start the local services, then try again.'
                : 'Try another search or category.'}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                filters.reset();
                onRefresh();
              }}
            >
              Refresh courses
            </Button>
          </div>
        )}
      </section>
      <section className="tutor-banner">
        <div>
          <div className="eyebrow">SHARE WHAT YOU KNOW</div>
          <h2>
            Your experience could be
            <br />
            someone else’s breakthrough.
          </h2>
          <p>Create a course. Inspire a learner. Make a difference.</p>
        </div>
        <Button size="lg" onClick={() => onTeach()}>
          Start teaching <ArrowRight size={18} />
        </Button>
      </section>
    </>
  );
}

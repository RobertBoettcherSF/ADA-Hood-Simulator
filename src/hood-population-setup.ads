--  Everyone in the city at the start of a game, in 1.2.91's order and on
--  its random stream (citygen.ts:539-925): owners, priests and reporters,
--  officials, police, FBI, snitches, citizens, the hiring places' recruits,
--  the four gangs (boss, office behind a front, six hoods, a lieutenant
--  with a one-man crew, two starting rackets), stances, opinions and wage
--  quotes.
with Hood.Random;

package Hood.Population.Setup with Preelaborate is

   procedure Populate
     (S    : in out Population_State;
      C    : in out Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
     with Pre => C.Status = Hood.City.Status_Ok;
   --  Main is the simulation stream where the city left it; it ends where
   --  1.2.91 returns from createWorld.

   procedure Top_Up
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry);
   --  Every hiring place topped up to its quota (recruitPool.ts:141-162):
   --  one idle man of the kind moved there a week, then new people.

   procedure Create
     (S        : in out Population_State;
      Main     : in out Hood.Random.Mulberry;
      Kind     : Role;
      X, Y     : Hood.Units.Units;
      Index    : out Integer_32;
      Female   : Integer_32 := -1;       --  0 or 1 given, -1 rolled
      Origin   : Integer_32 := -1;       --  heritage of both names
      Prefer   : Integer_32 := -1;       --  heritage favoured 12 to 1
      First    : Integer_32 := No_Name;  --  given names (no draws)
      Last     : Integer_32 := No_Name;
      Nick     : Integer_32 := No_Name;
      Portrait : Integer_32 := -1;
      Quality  : Long_Float := 1.0;
      Business : Boolean := False;
      Gang     : Gang_Ref := 0;
      Building : Integer_32 := No_Id);
   --  One person (createPerson, citygen.ts:95-141): the draws are sex,
   --  names, portrait and skills, in that order, each only when not given.
   --  Index is No_Id when the people cap is reached.

end Hood.Population.Setup;
